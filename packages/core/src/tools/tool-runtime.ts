import type { Assistant, PermissionLevel } from '@wbfm/shared';
import type { ServiceDeps } from '../services/deps';
import { createRetrievalService, DEFAULT_RETRIEVAL_TOP_K } from '../retrieval/retrieval-service';
import { createMcpTool } from '../mcp/mcp-tool';
import type { Tool, ToolContext, ToolMap } from './types';
import { currentTimeTool } from './current-time-tool';
import { knowledgeSearchTool } from './knowledge-search-tool';
import { fetchWebpageTool } from './fetch-webpage-tool';
import { screenSnapshotTool } from './computer/screen-snapshot-tool';
import { createInputTools } from './computer/input-tools';
import { createWindowTools } from './computer/window-tools';
import { createComputerChannelClient } from '../computer/channel-client';

/** 全部内置工具（默认全部关闭，由助手白名单开启） */
const ALL_TOOLS: Record<string, Tool> = {
  current_time: currentTimeTool,
  knowledge_search: knowledgeSearchTool,
  fetch_webpage: fetchWebpageTool,
  screen_snapshot: screenSnapshotTool,
};

// v0.7 M2：键鼠 / 窗口 / UIA 工具组（共用一个控制通道客户端）
for (const tool of [
  ...createInputTools(createComputerChannelClient()),
  ...createWindowTools(createComputerChannelClient()),
]) {
  ALL_TOOLS[tool.name] = tool;
}

export interface ResolvedTool {
  tool: Tool;
  /** 来源标识：'builtin' | 'mcp:<serverName>' */
  source: string;
}

/** v0.6 M4：调试台展示的工具元数据（聚合内置 + MCP） */
export interface DebugToolInfo {
  name: string;
  source: string;
  permission: PermissionLevel;
  description: string;
  parameters: Record<string, unknown>;
}

export interface ToolRuntime {
  /** 按助手白名单构造可用工具映射；模型不支持工具时返回空映射 */
  buildTools(assistant: Assistant, supportsTools: boolean): ToolMap;
  /** 构造工具执行上下文（绑定库与检索回调） */
  createContext(assistant: Assistant, signal?: AbortSignal, opts?: { visionCapable?: boolean }): ToolContext;
  /** v0.6 M4：解析工具名 → { tool, source }；内置查表，MCP 走注册表 */
  resolveTool(name: string): ResolvedTool | null;
  /** v0.6 M4：聚合全部可调试工具（内置 + 已连接 MCP），调试台用 */
  listDebugTools(): DebugToolInfo[];
  /** v0.6 M4：调试台用空 retrieve 上下文（不绑知识库） */
  createDebugToolContext(signal?: AbortSignal): ToolContext;
}

/**
 * 工具运行时：把 core 检索能力注入只读工具。
 * 工具不直接访问数据库，所有数据面操作经 ToolContext 回调，便于测试替换。
 */
export function createToolRuntime(deps: ServiceDeps): ToolRuntime {
  const retrieval = createRetrievalService(deps);

  /** 解析白名单项：内置查表，MCP 限定名走注册表（未连接/不存在则跳过） */
  function resolveTool(name: string): ResolvedTool | null {
    const builtin = ALL_TOOLS[name];
    if (builtin) return { tool: builtin, source: 'builtin' };
    const registry = deps.mcp;
    if (!registry) return null;
    const info = registry.getTools().find((tool) => tool.qualifiedName === name);
    if (!info) return null;
    return { tool: createMcpTool(info, registry), source: `mcp:${info.serverName}` };
  }

  return {
    resolveTool,

    listDebugTools() {
      const list: DebugToolInfo[] = [];
      // 内置工具
      for (const [name, tool] of Object.entries(ALL_TOOLS)) {
        list.push({
          name,
          source: 'builtin',
          permission: tool.permission ?? 'read',
          description: tool.description,
          parameters: tool.parameters,
        });
      }
      // MCP 工具（仅已连接服务器的）
      const mcpRegistry = deps.mcp;
      if (mcpRegistry) {
        for (const info of mcpRegistry.getTools()) {
          list.push({
            name: info.qualifiedName,
            source: `mcp:${info.serverName}`,
            permission: 'read',
            description: info.description || 'MCP 工具',
            parameters: info.inputSchema,
          });
        }
      }
      return list;
    },

    createDebugToolContext(signal) {
      // 调试台不绑知识库；knowledge_search 调用时 retrieve 返回空
      // visionCapable 固定 false：调试台仅验证通道连通性，截图以文本元数据返回
      return {
        signal,
        knowledgeBaseId: null,
        visionCapable: false,
        retrieve: async () => [],
      };
    },

    buildTools(assistant, supportsTools) {
      if (!supportsTools || assistant.enabledTools.length === 0) return new Map();
      const map = new Map<string, Tool>();
      for (const name of assistant.enabledTools) {
        const resolved = resolveTool(name);
        if (resolved) map.set(name, resolved.tool);
      }
      return map;
    },

    createContext(assistant, signal, opts) {
      return {
        signal,
        knowledgeBaseId: assistant.knowledgeBaseId,
        visionCapable: opts?.visionCapable ?? false,
        retrieve: (query, topK, retrieveSignal) =>
          retrieval.retrieve({
            knowledgeBaseId: assistant.knowledgeBaseId ?? '',
            query,
            topK: topK || DEFAULT_RETRIEVAL_TOP_K,
            signal: retrieveSignal,
          }),
      };
    },
  };
}
