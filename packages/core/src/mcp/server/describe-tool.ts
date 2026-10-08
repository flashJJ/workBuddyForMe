import { buildFlowInputJsonSchema, type FlowGraph } from '@wbfm/shared/schemas';
import { type WorkflowView } from '@wbfm/shared/types';
import { readFlowStartFields } from '../../serving/start-input';

/**
 * v0.9 MCP 工具描述符：一个已发布流程映射为一个 MCP tool。
 * name = flow_ + id 去横线后前 8 位十六进制（稳定短码，列表内碰撞追加位）。
 */
export interface McpToolDescriptor {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  /** 描述符对应的工作流 id（callFlow 反查用，不进入 MCP 报文） */
  workflowId: string;
}

const SHORT_CODE_LEN = 8;

function shortCodeOf(workflowId: string): string {
  return workflowId.replace(/-/g, '').slice(0, SHORT_CODE_LEN);
}

export function buildFlowMcpName(workflowId: string): string {
  return `flow_${shortCodeOf(workflowId)}`;
}

/**
 * 单流程描述符（v1 一密钥一端点一流程；stdio/http 两条承载共用）。
 * 名称稳定性优先：workflowId 不变则 tool name 不变。
 */
export function describeFlowAsMcpTool(workflow: WorkflowView, graph: FlowGraph): McpToolDescriptor {
  const fields = readFlowStartFields(graph);
  return {
    name: buildFlowMcpName(workflow.id),
    description: workflow.description || `工作流：${workflow.name}`,
    inputSchema: buildFlowInputJsonSchema(fields),
    workflowId: workflow.id,
  };
}

/**
 * 多流程短码去重（为同进程多端点/未来全局 token 预留）：
 * 碰撞时逐位追加 id 字符，仍碰撞最终回退完整 hex。
 */
export function ensureUniqueToolNames(tools: McpToolDescriptor[]): McpToolDescriptor[] {
  const used = new Set<string>();
  return tools.map((tool) => {
    const idx = tool.workflowId.replace(/-/g, '');
    let name = tool.name;
    let extra = SHORT_CODE_LEN;
    while (used.has(name)) {
      extra += 2;
      name = `flow_${idx.slice(0, Math.min(extra, idx.length))}`;
      if (extra >= idx.length && used.has(name)) {
        name = `flow_${idx}_${used.size}`;
        break;
      }
    }
    used.add(name);
    return name === tool.name ? tool : { ...tool, name };
  });
}
