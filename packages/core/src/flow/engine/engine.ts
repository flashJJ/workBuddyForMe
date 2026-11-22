import type { FlowEventPayload } from '@wbfm/shared/types';
import { resolveFlowRefs } from '../graph/refs';
import { createDefaultHandlers } from '../handlers/index';
import { buildIncomingIndex, isNodeLive } from './engine-live';
import { runNodeWithPolicy } from './engine-node';
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
 *   首个失败即 run_failed；未配置策略时事件序列与旧版一致。
 * - `parallelism>1` 走就绪集合调度（见 engine-parallel）：扇出分支并发执行，
 *   并发上限、失败隔离与结果收敛按 v4.22 契约；
 * - v4.23：checkpoint 预置作用域与节点状态，已落定节点静默跳过；节点尝试统一走重试/超时策略；
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

  // v4.23：从检查点恢复已落定节点（不补发事件）
  for (const settled of options.checkpoint?.nodes ?? []) {
    const node = compiled.nodesById.get(settled.nodeId);
    if (!node) continue;
    state.set(settled.nodeId, settled.status);
    if (settled.status !== 'succeeded') continue;
    const outputs = settled.outputs ?? {};
    scope.set(settled.nodeId, node.type === 'start' ? { params: ctx.input, outputs } : { outputs });
    if (node.type === 'condition') {
      const branch = outputs.result === true ? 'true' : 'false';
      const selected = (compiled.successors.get(settled.nodeId) ?? []).find((s) => s.handle === branch);
      if (selected) liveEdges.add(selected.edgeId);
    }
  }

  yield {
    type: 'run_started',
    ...base,
    version: options.version,
    trigger: ctx.trigger,
    parallelism,
    ...(options.checkpoint
      ? { resumed: true, ...(options.resumeReason ? { resumeReason: options.resumeReason } : {}) }
      : {}),
  };

  // v4.23：检查点里已有成功 end 时直接收尾（崩溃发生在 end 落库与运行终态之间）
  const settledEnd = (options.checkpoint?.nodes ?? [])
    .filter((settled) => settled.status === 'succeeded' && compiled.nodesById.get(settled.nodeId)?.type === 'end')
    .sort((a, b) => compiled.order.indexOf(a.nodeId) - compiled.order.indexOf(b.nodeId))[0];
  if (settledEnd) {
    yield { type: 'run_succeeded', ...base, output: settledEnd.outputs?.output ?? null };
    return;
  }

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

    // ── v4.23 续跑：已落定节点静默跳过 ──
    if (state.has(nodeId)) continue;

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

    const result = yield* runNodeWithPolicy({
      nodeId,
      node,
      config: resolvedConfig,
      ctx,
      handlers,
      base,
    });
    if (!result.ok) {
      if (result.aborted) {
        yield { type: 'run_cancelled', ...base };
        return;
      }
      state.set(nodeId, 'failed');
      yield {
        type: 'node_failed',
        ...base,
        nodeId,
        message: result.message,
        ...(result.attempt > 1 ? { attempt: result.attempt } : {}),
      };
      yield { type: 'run_failed', ...base, nodeId, message: result.message };
      return;
    }
    const outputs = result.outputs;
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

    yield { type: 'node_succeeded', ...base, nodeId, outputs, durationMs: result.durationMs };
    // v0.9 节点重放：目标节点执行完成即收尾（输出取目标节点，不要求连通到 end）
    if (options.replayTargetId && nodeId === options.replayTargetId && node.type !== 'end') {
      yield { type: 'run_succeeded', ...base, output: outputs.output ?? outputs ?? null };
      return;
    }
    if (node.type === 'end') {
      // 首个成功 end 收尾：其余未访问且不再导通的节点补发 skipped（观测完整性）
      for (const restId of compiled.order.slice(compiled.order.indexOf(nodeId) + 1)) {
        if (state.has(restId)) continue;
        if (!isNodeLive(restId, compiled.startNodeId, incomingById, state, liveEdges, compiled)) {
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
  }

  yield {
    type: 'run_failed',
    ...base,
    message: '执行结束但未经过任何 end 节点（条件分支未连通到结束节点）',
  };
}
