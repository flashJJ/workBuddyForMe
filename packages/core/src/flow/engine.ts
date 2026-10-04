import type { FlowEventPayload } from '@wbfm/shared';
import { resolveFlowRefs } from './refs';
import { createDefaultHandlers } from './handlers';
import type {
  CompiledFlow,
  FlowExecutionContext,
  FlowHandlerRegistry,
  FlowScope,
  RunFlowOptions,
} from './types';

/**
 * 工作流执行引擎（M0 骨架）：
 * - 按编译产物的拓扑序顺序执行节点，产出与 SSE 契约一致的 FlowEventPayload；
 * - M0 仅内置 start/end 处理器，未注册类型明确失败（M1 补齐其余 5 类）；
 * - 引擎是纯内存 AsyncGenerator，不依赖数据库（M1 由 run-store 订阅事件落库）；
 * - 运行到任一 end 节点即成功结束（其余分支不再执行）。
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
  const ctx: FlowExecutionContext = {
    signal: options.signal,
    input: options.input ?? {},
    scope,
    trigger: options.trigger ?? 'manual',
  };

  const aborted = () => options.signal?.aborted === true;

  yield { type: 'run_started', ...base, version: options.version, trigger: ctx.trigger };
  if (aborted()) {
    yield { type: 'run_cancelled', ...base };
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
      yield { type: 'run_failed', ...base, message: `节点不存在：${nodeId}`, nodeId };
      return;
    }

    // 执行前解析该节点配置里对祖先节点输出的引用
    let resolvedConfig: Record<string, unknown>;
    try {
      resolvedConfig = resolveFlowRefs(node.config, scope) as Record<string, unknown>;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      yield { type: 'node_failed', ...base, nodeId, message };
      yield { type: 'run_failed', ...base, message, nodeId };
      return;
    }

    yield { type: 'node_started', ...base, nodeId, nodeType: node.type };

    const handler = handlers[node.type];
    if (!handler) {
      const message = `节点类型「${node.type}」的处理器尚未注册（M1 实现）`;
      yield { type: 'node_failed', ...base, nodeId, message };
      yield { type: 'run_failed', ...base, message, nodeId };
      return;
    }

    let outputs: Record<string, unknown>;
    try {
      outputs = (await handler.run(resolvedConfig, ctx)) as Record<string, unknown>;
    } catch (err) {
      if (aborted()) {
        yield { type: 'run_cancelled', ...base };
        return;
      }
      const message = err instanceof Error ? err.message : String(err);
      yield { type: 'node_failed', ...base, nodeId, message };
      yield { type: 'run_failed', ...base, message, nodeId };
      return;
    }
    // 作用域统一形态：{ outputs: 节点产出 }；start 额外挂 params（nodes.start.params.* 与
    // nodes.start.outputs.params.* 两种写法都可用，其余节点引用走 nodes.<id>.outputs.<字段>）
    const scoped: Record<string, unknown> =
      node.type === 'start'
        ? { params: ctx.input, outputs: outputs ?? {} }
        : { outputs: outputs ?? {} };
    scope.set(nodeId, scoped);

    if (node.type === 'end') {
      yield { type: 'node_succeeded', ...base, nodeId, outputs };
      yield { type: 'run_succeeded', ...base, output: (outputs as { output?: unknown }).output ?? null };
      return;
    }
    yield { type: 'node_succeeded', ...base, nodeId, outputs };
  }

  // 编译器保证存在可达 end；走到这里属于内部不变量被破坏
  yield {
    type: 'run_failed',
    ...base,
    message: '执行结束但未经过任何 end 节点（图编译结果异常）',
  };
}
