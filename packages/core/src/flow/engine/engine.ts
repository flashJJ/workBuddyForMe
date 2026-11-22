import type { FlowEventPayload } from '@wbfm/shared/types';
import { resolveFlowRefs } from '../graph/refs';
import { createDefaultHandlers } from '../handlers/index';
import { buildIncomingIndex, isNodeLive } from './engine-live';
import { runNodeBody } from './engine-node';
import { runFlowParallel } from './engine-parallel';
import type {
  CompiledFlow,
  FlowExecutionContext,
  FlowHandlerRegistry,
  FlowNodeState,
  FlowScope,
  RunFlowOptions,
} from '../graph/types';

/** 并行度上限（v4.22 契约：1–4） */
const MAX_PARALLELISM = 4;

/** 解析本次运行的实际并发：显式覆盖 > 图字段 > 1，并钳到 1–4 */
export function resolveMaxConcurrency(
  compiled: CompiledFlow,
  override?: number,
): number {
  const raw = override ?? compiled.graph.parallelism ?? 1;
  if (!Number.isFinite(raw)) return 1;
  return Math.min(MAX_PARALLELISM, Math.max(1, Math.trunc(raw)));
}

/**
 * 工作流执行引擎：
 * - `parallelism=1`（默认）走 v4.21 原串行路径：按拓扑序执行，首个成功 end 即收尾，
 *   首个失败即 run_failed；事件序列与旧版逐字一致。
 * - `parallelism>1` 走就绪集合调度（见 engine-parallel）：扇出分支并发执行，
 *   并发上限、失败隔离与结果收敛按 v4.22 契约；
 * - human 节点内联挂起（先注册等待 → 发 node_waiting_human → await）；
 * - tool 节点统一解析 + write/danger 门控（同样的先注册/后发事件/再 await 时序）；
 * - 纯内存 AsyncGenerator；全程支持 abort（重放仍走串行路径）。
 */
export async function* runFlow(
  compiled: CompiledFlow,
  options: RunFlowOptions,
): AsyncGenerator<FlowEventPayload> {
  const runId = options.runId ?? '';
  const workflowId = options.workflowId;
  const base = { runId, workflowId };
  const handlers: FlowHandlerRegistry = { ...createDefaultHandlers(), ...options.handlers };
  const scope: FlowScope = new Map();
  const state = new Map<string, FlowNodeState>();
  /** condition 命中的分支边（其余出边视为不通） */
  const liveEdges = new Set<string>();
  const incomingById = buildIncomingIndex(compiled);

  const ctx: FlowExecutionContext = {
    signal: options.signal,
    input: options.input ?? {},
    scope,
    trigger: options.trigger ?? 'manual',
    interactive: options.interactive ?? true,
    ...options.context,
  };
  const aborted = () => options.signal?.aborted === true;
  const parallelism = resolveMaxConcurrency(compiled, options.maxConcurrency);

  yield {
    type: 'run_started',
    ...base,
    version: options.version,
    trigger: ctx.trigger,
    parallelism,
  };

  // 重放沿用 v0.9 串行语义；并发仅在显式开启的图上生效
  if (parallelism > 1 && !options.onlyNodeIds && !options.replayTargetId) {
    yield* runFlowParallel({
      compiled,
      ctx,
      handlers,
      base,
      state,
      liveEdges,
      incoming: incomingById,
      maxConcurrency: parallelism,
      aborted,
    });
    return;
  }

  for (const nodeId of compiled.order) {
    if (aborted()) {
      yield { type: 'run_cancelled', ...base };
      return;
    }
    const node = compiled.nodesById.get(nodeId);
    if (!node) {
      yield { type: 'node_failed', ...base, nodeId, message: '节点在编译产物中不存在' };
      yield { type: 'run_failed', ...base, nodeId, message: '节点在编译产物中不存在' };
      return;
    }

    // ── v0.9 重放：祖先闭包之外的节点不执行（补发 skipped 观测事件） ──
    if (options.onlyNodeIds && !options.onlyNodeIds.has(nodeId)) {
      state.set(nodeId, 'skipped');
      yield { type: 'node_skipped', ...base, nodeId, reason: '不在本次重放的祖先闭包内' };
      continue;
    }

    // ── 活性判断：未命中分支链上的节点直接 skipped ──
    const live = isNodeLive(nodeId, compiled.startNodeId, incomingById, state, liveEdges, compiled);
    if (!live) {
      state.set(nodeId, 'skipped');
      yield { type: 'node_skipped', ...base, nodeId, reason: '所在分支未被条件命中' };
      continue;
    }

    // 执行前解析引用（模板插值 / $ref 整字段绑定）
    let resolvedConfig: Record<string, unknown>;
    try {
      resolvedConfig = resolveFlowRefs(node.config, scope) as Record<string, unknown>;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      state.set(nodeId, 'failed');
      yield { type: 'node_failed', ...base, nodeId, message };
      yield { type: 'run_failed', ...base, nodeId, message };
      return;
    }

    yield { type: 'node_started', ...base, nodeId, nodeType: node.type, inputs: resolvedConfig };
    const startedAt = Date.now();

    try {
      const outputs = yield* runNodeBody(nodeId, node.type, resolvedConfig, ctx, handlers, base);
      if (aborted()) {
        yield { type: 'run_cancelled', ...base };
        return;
      }

      // 作用域统一形态：{ outputs: 节点产出 }；start 额外挂 params
      // （nodes.<id>.outputs.<字段> 引用约定；start 另有 nodes.start.params.<字段>）
      if (node.type === 'start') {
        scope.set(nodeId, { params: ctx.input, outputs: outputs ?? {} });
      } else {
        scope.set(nodeId, { outputs: outputs ?? {} });
      }
      state.set(nodeId, 'succeeded');

      // condition：激活命中分支边
      if (node.type === 'condition') {
        const branch = outputs.result === true ? 'true' : 'false';
        const selected = (compiled.successors.get(nodeId) ?? []).find((s) => s.handle === branch);
        if (selected) liveEdges.add(selected.edgeId);
      }

      yield { type: 'node_succeeded', ...base, nodeId, outputs, durationMs: Date.now() - startedAt };
      // v0.9 节点重放：目标节点执行完成即收尾（输出取目标节点，不要求连通到 end）
      if (options.replayTargetId && nodeId === options.replayTargetId && node.type !== 'end') {
        yield { type: 'run_succeeded', ...base, output: outputs.output ?? outputs ?? null };
        return;
      }
      if (node.type === 'end') {
        // 首个成功 end 收尾：其余未访问且不再导通的节点补发 skipped（观测完整性）
        for (const restId of compiled.order.slice(compiled.order.indexOf(nodeId) + 1)) {
          if (state.has(restId)) continue;
          if (
            !isNodeLive(restId, compiled.startNodeId, incomingById, state, liveEdges, compiled)
          ) {
            state.set(restId, 'skipped');
            yield {
              type: 'node_skipped',
              ...base,
              nodeId: restId,
              reason: '所在分支未被条件命中',
            };
          }
        }
        yield { type: 'run_succeeded', ...base, output: outputs.output ?? null };
        return;
      }
    } catch (err) {
      if (aborted()) {
        yield { type: 'run_cancelled', ...base };
        return;
      }
      const message = err instanceof Error ? err.message : String(err);
      state.set(nodeId, 'failed');
      yield { type: 'node_failed', ...base, nodeId, message };
      yield { type: 'run_failed', ...base, nodeId, message };
      return;
    }
  }

  yield {
    type: 'run_failed',
    ...base,
    message: '执行结束但未经过任何 end 节点（条件分支未连通到结束节点）',
  };
}
