import {
  MCP_CONNECT_TIMEOUT_MS,
  MCP_LIST_TIMEOUT_MS,
  MCP_MAX_TOOLS_PER_SERVER,
} from '@wbfm/shared/constants';
import { buildMcpToolName } from '@wbfm/shared/schemas';
import type { McpToolInfo } from '@wbfm/shared/types';
import { MCP_PROTOCOL_VERSION } from './jsonrpc';
import type { McpClient, McpServerCapabilities, McpToolCallOutcome } from './client';
import { sanitizeToolName } from './client';

export interface McpHttpClientOptions {
  url: string;
  headers?: Record<string, string>;
}

/** MCP over HTTP：POST-only JSON-RPC 2.0（Streamable HTTP 最小子集，无 SSE）。 */
export function createMcpHttpClient(options: McpHttpClientOptions): McpClient {
  const { url, headers = {} } = options;
  let seq = 0;

  async function post<T>(method: string, params: unknown, timeoutMs: number): Promise<T> {
    const id = ++seq;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          ...headers,
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id,
          method,
          params,
        }),
        signal: controller.signal,
      });
      clearTimeout(timer);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      const body: unknown = await response.json();
      if (!body || typeof body !== 'object' || Array.isArray(body)) {
        throw new Error('Invalid JSON-RPC response');
      }
      const record = body as Record<string, unknown>;
      if (record.error && typeof record.error === 'object') {
        const err = record.error as Record<string, unknown>;
        throw new Error(`MCP error (${err.code}): ${err.message}`);
      }
      return (record.result ?? {}) as T;
    } catch (error) {
      clearTimeout(timer);
      throw error;
    }
  }

  return {
    async initialize() {
      const result = await post<McpServerCapabilities>(
        'initialize',
        {
          protocolVersion: MCP_PROTOCOL_VERSION,
          capabilities: {},
          clientInfo: { name: 'workbuddy-for-me', version: '0.6.0' },
        },
        MCP_CONNECT_TIMEOUT_MS,
      );
      if (typeof result.protocolVersion !== 'string' || !result.protocolVersion) {
        throw new Error('MCP 服务器未返回协议版本');
      }
      return result;
    },

    async listTools(serverName: string) {
      const tools: McpToolInfo[] = [];
      let cursor: string | undefined;
      do {
        const result = await post<{ tools?: unknown[]; nextCursor?: unknown }>(
          'tools/list',
          cursor ? { cursor } : {},
          MCP_LIST_TIMEOUT_MS,
        );
        for (const raw of result.tools ?? []) {
          if (!raw || typeof raw !== 'object') continue;
          const r = raw as Record<string, unknown>;
          if (typeof r.name !== 'string' || r.name === '') continue;
          if (tools.length >= MCP_MAX_TOOLS_PER_SERVER) break;
          const safeName = sanitizeToolName(r.name);
          tools.push({
            serverName,
            name: safeName,
            qualifiedName: buildMcpToolName(serverName, safeName),
            description: typeof r.description === 'string' ? r.description : '',
            inputSchema:
              r.inputSchema && typeof r.inputSchema === 'object'
                ? (r.inputSchema as Record<string, unknown>)
                : { type: 'object', properties: {} },
          });
        }
        cursor = typeof result.nextCursor === 'string' ? result.nextCursor : undefined;
      } while (cursor && tools.length < MCP_MAX_TOOLS_PER_SERVER);
      return tools;
    },

    async callTool(name, args, timeoutMs) {
      const result = await post<{ content?: unknown[]; isError?: unknown }>(
        'tools/call',
        { name, arguments: args ?? {} },
        timeoutMs,
      );
      const output = ((result.content ?? []) as Array<{ text?: unknown }>)
        .map((part) => (typeof part.text === 'string' ? part.text : ''))
        .filter((text) => text !== '')
        .join('\n');
      return {
        ok: result.isError !== true,
        isError: result.isError === true,
        output: output || '（工具无文本输出）',
      };
    },

    async close() {
      // HTTP 无状态，close 无操作
    },

    handleMessage() {
      // HTTP 无服务器推送，空实现
    },
  };
}
