import {
  buildFlowInputJsonSchema,
  buildFlowToolName,
  flowStartConfigSchema,
  type FlowGraph,
  type FlowInputField,
} from '@wbfm/shared/schemas';
import { type ToolSubstep, type WorkflowView } from '@wbfm/shared/types';
import type { Tool } from '../tools/types';

/** 对话触发结果：终态输出 + 节点子步骤快照（工具卡片展示用） */
export type FlowChatInvokeResult =
  | { ok: true; output: unknown; substeps: ToolSubstep[] }
  | { ok: false; error: string; substeps: ToolSubstep[] };

/**
 * 已发布工作流 → 对话工具（flow:<workflowId>，与 mcp:<server>:<tool> 同构）。
 * parameters 由 start 节点声明的入参生成；run 委托给 FlowRunService 的对话执行器。
 */
export interface FlowToolInvoker {
  /** 以对话方式（非交互、trigger=chat）执行流程，返回最终输出或错误；onSubstep 实时上报节点进度 */
  invokeFromChat(
    workflowId: string,
    input: Record<string, unknown>,
    onSubstep?: (substep: ToolSubstep) => void,
  ): Promise<FlowChatInvokeResult>;
}

function readStartFields(graph: FlowGraph): FlowInputField[] {
  const start = graph.nodes.find((n) => n.type === 'start');
  if (!start) return [];
  const parsed = flowStartConfigSchema.safeParse(start.config);
  return parsed.success ? parsed.data.inputs : [];
}

function applyDefaults(fields: FlowInputField[], rawArgs: unknown): Record<string, unknown> {
  const args = (rawArgs && typeof rawArgs === 'object' ? rawArgs : {}) as Record<string, unknown>;
  const input: Record<string, unknown> = {};
  for (const field of fields) {
    if (field.name in args) {
      input[field.name] = args[field.name];
    } else if (field.default !== undefined) {
      input[field.name] = field.default;
    }
  }
  return input;
}

export function buildFlowTool(
  workflow: WorkflowView,
  graph: FlowGraph,
  invoker: FlowToolInvoker,
): Tool {
  const fields = readStartFields(graph);
  return {
    name: buildFlowToolName(workflow.id),
    description: workflow.description || `工作流：${workflow.name}`,
    parameters: buildFlowInputJsonSchema(fields),
    permission: 'read',
    async run(rawArgs, ctx) {
      const result = await invoker.invokeFromChat(
        workflow.id,
        applyDefaults(fields, rawArgs),
        ctx.onSubstep,
      );
      const substeps = result.substeps.length > 0 ? { substeps: result.substeps } : {};
      if (result.ok) {
        const text =
          typeof result.output === 'string' ? result.output : JSON.stringify(result.output);
        return {
          ok: true,
          output: text,
          summary: `工作流「${workflow.name}」执行完成`,
          ...substeps,
        };
      }
      return {
        ok: false,
        output: `工作流「${workflow.name}」执行失败：${result.error}`,
        summary: '工作流执行失败',
        ...substeps,
      };
    },
  };
}
