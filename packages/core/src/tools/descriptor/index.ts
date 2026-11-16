import type { McpToolInfo } from '@wbfm/shared/types';
import { toolDescriptorSchema, type ToolDescriptor } from '@wbfm/shared/schemas';
import type { Tool } from '../types';

/**
 * v4.3 M5：把内置/流程工具与 MCP 工具映射为统一描述符。
 * 只做读取展示，不改变 ToolRuntime 的执行入口或模型路由。
 */
export function describeTool(tool: Tool, source = 'builtin'): ToolDescriptor {
  const permission = tool.permission ?? 'read';
  return toolDescriptorSchema.parse({
    name: tool.name,
    description: tool.description,
    inputSchema: tool.parameters,
    source,
    permissions: [permission],
    readOnly: permission === 'read',
    alwaysConfirm: tool.alwaysConfirm ?? false,
  });
}

export function describeMcpTool(info: McpToolInfo): ToolDescriptor {
  return toolDescriptorSchema.parse({
    name: info.qualifiedName,
    description: info.description || 'MCP 工具',
    inputSchema: info.inputSchema,
    source: `mcp:${info.serverName}`,
    permissions: ['read'],
    readOnly: true,
    alwaysConfirm: false,
  });
}
