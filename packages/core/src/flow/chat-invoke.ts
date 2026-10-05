import type { ToolSubstep } from '@wbfm/shared';
import type { FlowEventBus } from './queue/event-bus';
import { createSubstepCollector, flowNodeTitle } from './flow-substeps';
import type { FlowExecutor } from './flow-execution';
import type { FlowChatInvokeResult, FlowToolInvoker } from './flow-tool';

/**
 * v0.8 对话触发执行协程（v0.9 从 run-service 抽出以控制文件规模）：
 * chat 在调用协程内直接执行（不经队列），事件同时上总线，
 * 收敛最终输出与工具子步骤快照。
 */
export interface ChatInvokeDeps {
  loadCompiledPublished: (workflowId: string) => {
    version: number;
    graph: import('@wbfm/shared').FlowGraph;
    compiled: import('./types').CompiledFlow;
  };
  createChatRun: (params: { workflowId: string; input: Record<string, unknown> }) => string;
  executor: FlowExecutor;
  bus: FlowEventBus;
}

export function createChatInvoker(deps: ChatInvokeDeps): FlowToolInvoker['invokeFromChat'] {
  return async function invokeFromChat(workflowId, input, onSubstep): Promise<FlowChatInvokeResult> {
    const { version, graph, compiled } = deps.loadCompiledPublished(workflowId);
    const titleOf = (nodeId: string) => {
      const node = graph.nodes.find((n) => n.id === nodeId);
      return node ? flowNodeTitle(node) : nodeId;
    };
    const collector = createSubstepCollector(titleOf);
    const runId = deps.createChatRun({ workflowId, input });
    const generator = deps.executor.execute(compiled, {
      runId,
      workflowId,
      version,
      input: input ?? {},
      trigger: 'chat',
      interactive: false,
    });
    for await (const event of generator) {
      deps.bus.publish(runId, event);
      const substep = collector.absorb(event);
      if (substep) onSubstep?.(substep);
      if (event.type === 'run_succeeded') {
        return { ok: true, output: event.output, substeps: collector.list() };
      }
      if (event.type === 'run_failed') {
        return { ok: false, error: event.message, substeps: collector.list() };
      }
      if (event.type === 'run_cancelled') {
        return { ok: false, error: '工作流执行被中断', substeps: collector.list() };
      }
    }
    return { ok: false, error: '工作流未产出结果（事件流意外结束）', substeps: collector.list() };
  };
}

export type { ToolSubstep };
