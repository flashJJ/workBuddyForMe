import type { FlowGraph } from '@wbfm/shared';
import type { ToolRuntime } from '../tools/tool-runtime';

/**
 * v0.9 危险节点扫描：给定发布图，列出所有 write/danger 权限的 tool 节点。
 * 供端点设置 UI 提示与发布时策略确认（M4）使用；
 * 解析不到的工具（MCP 未连接等）按未知跳过——策略执行点会在运行时再次判定。
 */
export interface FlowDangerNode {
  nodeId: string;
  toolName: string;
  permission: 'write' | 'danger';
}

export function scanFlowDangerNodes(
  graph: FlowGraph,
  runtime: ToolRuntime,
): FlowDangerNode[] {
  const result: FlowDangerNode[] = [];
  for (const node of graph.nodes) {
    if (node.type !== 'tool') continue;
    const toolName = typeof node.config?.toolName === 'string' ? node.config.toolName : '';
    if (!toolName) continue;
    const resolved = runtime.resolveTool(toolName);
    const permission = resolved?.tool.permission;
    if (permission === 'write' || permission === 'danger') {
      result.push({ nodeId: node.id, toolName, permission });
    }
  }
  return result;
}
