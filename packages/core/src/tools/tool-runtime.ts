import type { Assistant } from '@wbfm/shared';
import type { ServiceDeps } from '../services/deps';
import { createRetrievalService, DEFAULT_RETRIEVAL_TOP_K } from '../retrieval/retrieval-service';
import { createMcpTool } from '../mcp/mcp-tool';
import type { Tool, ToolContext, ToolMap } from './types';
import { currentTimeTool } from './current-time-tool';
import { knowledgeSearchTool } from './knowledge-search-tool';
import { fetchWebpageTool } from './fetch-webpage-tool';

/** 全部内置工具（默认全部关闭，由助手白名单开启） */
const ALL_TOOLS: Record<string, Tool> = {
  current_time: currentTimeTool,
  knowledge_search: knowledgeSearchTool,
  fetch_webpage: fetchWebpageTool,
};

export interface ResolvedTool {
  tool: Tool;
  /** 来源标识：'builtin' | 'mcp:<serverName>' */
  source: string;
}

export interface ToolRuntime {
  /** 按助手白名单构造可用工具映射；模型不支持工具时返回空映射 */
  buildTools(assistant: Assistant, supportsTools: boolean): ToolMap;
  /** 构造工具执行上下文（绑定库与检索回调） */
  createContext(assistant: Assistant, signal?: AbortSignal): ToolContext;
  /** v0.6 M4：解析工具名 → { tool, source }；内置查表，MCP 走注册表 */
  resolveTool(name: string): ResolvedTool | null;
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

    buildTools(assistant, supportsTools) {
      if (!supportsTools || assistant.enabledTools.length === 0) return new Map();
      const map = new Map<string, Tool>();
      for (const name of assistant.enabledTools) {
        const resolved = resolveTool(name);
        if (resolved) map.set(name, resolved.tool);
      }
      return map;
    },

    createContext(assistant, signal) {
      return {
        signal,
        knowledgeBaseId: assistant.knowledgeBaseId,
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
