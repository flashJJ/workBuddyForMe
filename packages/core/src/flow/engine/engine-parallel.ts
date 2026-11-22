import type { FlowEventPayload } from '@wbfm/shared/types';
import type { FlowNode } from '@wbfm/shared/schemas';
import { resolveFlowRefs } from '../graph/refs';
import { isNodeLive, type IncomingEdge } from './engine-live';
import { runNodeBody, type EventBase } from './engine-node';
import type {
  CompiledFlow,
  FlowExecutionContext,
  FlowHandlerRegistry,
  FlowNodeState,
} from '../graph/types';

/**
 * v4.22 并行调度器（就绪集合驱动）：
 * - 前驱全部落定（succeeded/skipped/failed）且活性成立才可启动；
 * - 可并行类型：llm / knowledgeSearch / condition / 只读 tool / end；
 *   human / 写危险 tool / agent / start 需要独占运行（避免授权弹窗并发）；
 * - 并发 > 1 时单节点失败只标记自身，后代随活性判断级联 skipped，无关分支继续；
 * - 多个成功 end 记录候选，运行收敛后取拓扑序靠前者作为输出。
 */

export interface ParallelRunInput {
  compiled: CompiledFlow;
  ctx: FlowExecutionContext;
  handlers: FlowHandlerRegistry;
  base: EventBase;
  state: Map<string, FlowNodeState>;
  liveEdges: Set<string>;
  incoming: Map<string, IncomingEdge[]>;
  maxConcurrency: number;
  onlyNodeIds?: ReadonlySet<string>;
  aborted: () => boolean;
}

/** 可并行的节点类型（start/human/agent 与写危险 tool 由 canRunParallel 排除） */
const PARALLEL_SAFE = new Set(['llm', 'knowledgeSearch', 'condition', 'end']);

export async function* runFlowParallel(input: ParallelRunInput): AsyncGenerator<FlowEventPayload> {
  const { compiled, ctx, handlers, base, state, liveEdges, incoming, maxConcurrency, aborted } = input;
  const pending = new Set(compiled.order);
  const running = new Set<string>();
  const skipReasons = new Map<string, string>();
  const queue: FlowEventPayload[] = [];
  const waiters: Array<(event: FlowEventPayload | null) => void> = [];
  const ends: Array<{ nodeId: string; output: unknown }> = [];
  const failures: Array<{ nodeId: string; message: string }> = [];
  let cancelled = false;

  const push = (event: FlowEventPayload) => {
    const waiter = waiters.shift();
    if (waiter) waiter(event);
    else queue.push(event);
  };

  const wakeIdle = () => {
    if (running.size > 0 || queue.length > 0) return;
    for (const waiter of waiters.splice(0)) waiter(null);
  };

  const skip = (nodeId: string, reason: string) => {
    state.set(nodeId, 'skipped');
    skipReasons.set(nodeId, reason);
    pending.delete(nodeId);
    push({ type: 'node_skipped', ...base, nodeId, reason });
  };

  /** 失败隔离原因优先于分支剪枝原因 */
  const skipReasonOf = (nodeId: string): string => {
    const preds = compiled.predecessors.get(nodeId) ?? [];
    if (preds.some((p) => state.get(p) === 'failed' || skipReasons.get(p) === '上游失败')) {
      return '上游失败';
    }
    return '所在分支未被条件命中';
  };

  /** end 之外：llm / knowledgeSearch / condition / 只读 tool 可并行，其余独占 */
  const canRunParallel = async (node: FlowNode): Promise<boolean> => {
    if (PARALLEL_SAFE.has(node.type)) return true;
    if (node.type !== 'tool') return false;
    const toolName = String((node.config as { toolName?: unknown }).toolName ?? '').trim();
    if (!toolName || !ctx.resolveTool) return false;
    try {
      const tool = await ctx.resolveTool(toolName);
      return (tool?.permission ?? 'read') === 'read';
    } catch {
      return false;
    }
  };

  const execute = (node: FlowNode): void => {
    const nodeId = node.id;
    pending.delete(nodeId);
    running.add(nodeId);
    void (async () => {
      const startedAt = Date.now();
      try {
        const resolvedConfig = resolveFlowRefs(node.config, ctx.scope) as Record<string, unknown>;
        push({ type: 'node_started', ...base, nodeId, nodeType: node.type, inputs: resolvedConfig });

        const iterator = runNodeBody(nodeId, node.type, resolvedConfig, ctx, handlers, base);
        let outputs: Record<string, unknown> | undefined;
        for (;;) {
          const step = await iterator.next();
          if (step.done) {
            outputs = step.value;
            break;
          }
          push(step.value);
        }

        if (aborted()) {
          state.set(nodeId, 'skipped');
          return;
        }
        if (node.type === 'start') {
          ctx.scope.set(nodeId, { params: ctx.input, outputs: outputs ?? {} });
        } else {
          ctx.scope.set(nodeId, { outputs: outputs ?? {} });
        }
        state.set(nodeId, 'succeeded');
        if (node.type === 'condition') {
          const branch = outputs?.result === true ? 'true' : 'false';
          const selected = (compiled.successors.get(nodeId) ?? []).find((s) => s.handle === branch);
          if (selected) liveEdges.add(selected.edgeId);
        }
        if (node.type === 'end') {
          ends.push({ nodeId, output: outputs?.output ?? null });
        }
        push({
          type: 'node_succeeded',
          ...base,
          nodeId,
          outputs,
          durationMs: Date.now() - startedAt,
        });
      } catch (err) {
        if (aborted()) {
          state.set(nodeId, 'skipped');
          return;
        }
        const message = err instanceof Error ? err.message : String(err);
        state.set(nodeId, 'failed');
        push({ type: 'node_failed', ...base, nodeId, message });
        failures.push({ nodeId, message });
      } finally {
        running.delete(nodeId);
        wakeIdle();
      }
    })();
  };

  const nextEvent = (): Promise<FlowEventPayload | null> => {
    if (queue.length > 0) return Promise.resolve(queue.shift()!);
    if (running.size === 0) return Promise.resolve(null);
    return new Promise((resolve) => waiters.push(resolve));
  };

  /** 扫描一轮：最多落定（skip）或启动一个节点；返回本轮是否有进展 */
  const scheduleOnce = async (): Promise<boolean> => {
    for (const nodeId of compiled.order) {
      if (!pending.has(nodeId)) continue;
      const preds = compiled.predecessors.get(nodeId) ?? [];
      if (!preds.every((p) => state.has(p))) continue;

      if (input.onlyNodeIds && !input.onlyNodeIds.has(nodeId)) {
        skip(nodeId, '不在本次重放的祖先闭包内');
        return true;
      }
      const node = compiled.nodesById.get(nodeId);
      if (!node) {
        state.set(nodeId, 'failed');
        pending.delete(nodeId);
        failures.push({ nodeId, message: '节点在编译产物中不存在' });
        return true;
      }
      if (!isNodeLive(nodeId, compiled.startNodeId, incoming, state, liveEdges, compiled)) {
        skip(nodeId, skipReasonOf(nodeId));
        return true;
      }
      if (running.size >= maxConcurrency) return false;

      const parallelSafe = await canRunParallel(node);
      if (!parallelSafe && running.size > 0) continue; // 独占节点等空场
      execute(node);
      return true;
    }
    return false;
  };

  try {
    for (;;) {
      if (aborted()) cancelled = true;

      // 先尽量落定/启动，再消费事件：避免节点在扫描的 await 间隙完成后被漏调度
      let progressed = false;
      if (!cancelled) {
        while (await scheduleOnce()) progressed = true;
      }

      if (queue.length > 0) {
        yield queue.shift()!;
        continue;
      }
      if (running.size > 0) {
        const event = await nextEvent();
        if (event) yield event;
        continue;
      }
      if (cancelled || !progressed) break;
    }
  } finally {
    // 消费端提前中止（return）时唤醒残留等待者，避免悬挂
    wakeIdle();
  }

  if (cancelled) {
    yield { type: 'run_cancelled', ...base };
    return;
  }
  if (failures.length > 0) {
    const first = failures[0]!;
    yield { type: 'run_failed', ...base, nodeId: first.nodeId, message: first.message };
    return;
  }
  if (ends.length > 0) {
    ends.sort((a, b) => compiled.order.indexOf(a.nodeId) - compiled.order.indexOf(b.nodeId));
    yield { type: 'run_succeeded', ...base, output: ends[0]!.output };
    return;
  }
  yield {
    type: 'run_failed',
    ...base,
    message: '执行结束但未经过任何 end 节点（条件分支未连通到结束节点）',
  };
}
