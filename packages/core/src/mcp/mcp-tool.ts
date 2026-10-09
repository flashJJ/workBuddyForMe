import { MCP_CALL_TIMEOUT_MS } from '@wbfm/shared/constants';
import type { McpToolInfo } from '@wbfm/shared/types';
import type { Tool, ToolContext, ToolResult } from '../tools/types';
import type { McpRegistry } from './registry';

/** MCP 工具描述统一追加来源标注（v0.6 P0-4 可观测性也用这个前缀） */
function describeSource(info: McpToolInfo): string {
  return `（来源：MCP 服务器 ${info.serverName}）`;
}

/**
 * 把 MCP 工具包装为与内置工具同构的 Tool：
 * - 参数 schema 直接透传服务端 inputSchema（JSON Schema）；
 * - 结果仅回传文本聚合；isError 归一为 ok:false；
 * - 超时用 MCP_CALL_TIMEOUT_MS（文件检索类操作较慢）。
 */
export function createMcpTool(info: McpToolInfo, registry: McpRegistry): Tool {
  return {
    name: info.qualifiedName,
    description: `${info.description || 'MCP 工具'}${describeSource(info)}`,
    permission: 'read',
    parameters: info.inputSchema,
    async run(rawArgs: unknown, _ctx: ToolContext): Promise<ToolResult> {
      const outcome = await registry.callTool(
        info.qualifiedName,
        rawArgs,
        MCP_CALL_TIMEOUT_MS,
      );
      if (!outcome) {
        return {
          ok: false,
          output: `MCP 工具 ${info.qualifiedName} 所在服务器未连接或工具已下线。`,
          summary: 'MCP 服务器未连接',
        };
      }
      return {
        ok: outcome.ok,
        output: outcome.output,
        summary: outcome.output,
      };
    },
  };
}
