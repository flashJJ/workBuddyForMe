import {
  MCP_CONNECT_TIMEOUT_MS,
  MCP_LIST_TIMEOUT_MS,
  MCP_MAX_TOOLS_PER_SERVER,
} from '@wbfm/shared/constants';
import { buildMcpToolName } from '@wbfm/shared/schemas';
import type { McpToolInfo } from '@wbfm/shared/types';
import { APP_VERSION } from '@wbfm/shared/version';
import { MCP_PROTOCOL_VERSION } from './jsonrpc';
import type { McpClient, McpServerCapabilities } from './client';
import { sanitizeToolName } from './client';

export interface McpHttpClientOptions {
  url: string;
  headers?: Record<string, string>;
  /** v2.24：OAuth 令牌注入与 401 自动刷新（仅 HTTP 传输） */
  auth?: {
    headers(): Promise<Record<string, string>>;
    refresh(): Promise<Record<string, string> | null>;
  };
}

/**
 * 解析 SSE 响应中的 data 帧。
 * Streamable HTTP 允许服务器用 text/event-stream 回包（Context7 等）；
 * 一个 POST 可能返回多条消息，调用方按 JSON-RPC id 取自己那条。
 */
export function parseSseDataFrames(text: string): string[] {
  const frames: string[] = [];
  for (const block of text.replace(/\r\n/g, '\n').split('\n\n')) {
    const dataLines = block
      .split('\n')
      .filter((line) => line.startsWith('data:'))
      .map((line) => line.slice(5).trimStart());
    if (dataLines.length > 0) frames.push(dataLines.join('\n'));
  }
  return frames;
}

function httpError(status: number, body: string): Error {
  const detail = body.trimStart().startsWith('<') ? '' : body.trim().slice(0, 200);
  if (status === 401 || status === 403) {
    return new Error(`MCP 服务器要求鉴权（HTTP ${status}），请检查 Headers 中的令牌`);
  }
  if (status === 404) return new Error('MCP 端点不存在（HTTP 404），请检查 URL');
  if (status === 429) return new Error('MCP 服务器限流（HTTP 429），请稍后重试');
  return new Error(`MCP HTTP 请求失败（HTTP ${status}）${detail ? `：${detail}` : ''}`);
}

/** MCP over HTTP：Streamable HTTP 最小子集（JSON 或 SSE 回包 + 会话头）。 */
export function createMcpHttpClient(options: McpHttpClientOptions): McpClient {
  const { url, headers = {}, auth } = options;
  let seq = 0;
  let sessionId: string | null = null;
  let negotiatedVersion: string | null = null;

  async function requestHeaders(
    override?: Record<string, string> | null,
  ): Promise<Record<string, string>> {
    const authHeaders = override ?? (auth ? await auth.headers().catch(() => ({})) : {});
    const result: Record<string, string> = {
      ...authHeaders,
      'Content-Type': 'application/json',
      // 明确接受两种回包，避免服务器只能返回 JSON 时协商失败
      Accept: 'application/json, text/event-stream',
      // 显式配置的 Headers 优先（例如用户自带 PAT 时不被 OAuth 覆盖）
      ...headers,
    };
    if (sessionId) result['Mcp-Session-Id'] = sessionId;
    if (negotiatedVersion) result['MCP-Protocol-Version'] = negotiatedVersion;
    return result;
  }

  async function readResult<T>(response: Response, id: number): Promise<T> {
    const contentType = response.headers.get('content-type') ?? '';
    let payload: unknown;
    if (contentType.includes('text/event-stream')) {
      const raw = await response.text();
      const frames = parseSseDataFrames(raw);
      const match = frames
        .map((frame) => {
          try {
            return JSON.parse(frame) as Record<string, unknown>;
          } catch {
            return null;
          }
        })
        .find((item) => item && item.id === id);
      if (!match) throw new Error('MCP SSE 响应中没有匹配的 JSON-RPC 消息');
      payload = match;
    } else {
      const text = await response.text();
      try {
        payload = JSON.parse(text);
      } catch {
        throw new Error('MCP 服务器返回了非 JSON 内容');
      }
    }
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
      throw new Error('Invalid JSON-RPC response');
    }
    const record = payload as Record<string, unknown>;
    if (record.error && typeof record.error === 'object') {
      const err = record.error as Record<string, unknown>;
      throw new Error(`MCP error (${err.code}): ${err.message}`);
    }
    return (record.result ?? {}) as T;
  }

  async function post<T>(method: string, params: unknown, timeoutMs: number): Promise<T> {
    const id = ++seq;
    const body = JSON.stringify({ jsonrpc: '2.0', id, method, params });
    const deadline = Date.now() + timeoutMs;
    let refreshedHeaders: Record<string, string> | null = null;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const remaining = Math.max(1, deadline - Date.now());
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), remaining);
      try {
        const response = await fetch(url, {
          method: 'POST',
          headers: await requestHeaders(refreshedHeaders),
          body,
          signal: controller.signal,
        });
        // 会话建立：initialize 响应头里可能带 Mcp-Session-Id
        const nextSession = response.headers.get('mcp-session-id');
        if (nextSession) sessionId = nextSession;
        if (response.status === 401 && auth && attempt === 0) {
          // 令牌过期/被撤销：刷新一次后重试同一请求
          await response.text().catch(() => '');
          const refreshed = await auth.refresh().catch(() => null);
          if (refreshed) {
            refreshedHeaders = refreshed;
            continue;
          }
        }
        if (!response.ok) throw httpError(response.status, await response.text().catch(() => ''));
        return await readResult<T>(response, id);
      } catch (error) {
        if (error instanceof Error && error.name === 'AbortError') {
          throw new Error(`MCP HTTP 请求 ${method} 超时（${Math.round(timeoutMs / 1000)}s）`);
        }
        throw error;
      } finally {
        clearTimeout(timer);
      }
    }
    throw new Error(`MCP HTTP 请求 ${method} 鉴权失败`);
  }

  return {
    async initialize() {
      const result = await post<McpServerCapabilities>(
        'initialize',
        {
          protocolVersion: MCP_PROTOCOL_VERSION,
          capabilities: {},
          clientInfo: { name: 'workbuddy-for-me', version: APP_VERSION },
        },
        MCP_CONNECT_TIMEOUT_MS,
      );
      if (typeof result.protocolVersion !== 'string' || !result.protocolVersion) {
        throw new Error('MCP 服务器未返回协议版本');
      }
      negotiatedVersion = result.protocolVersion;
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
      // 有会话时按规范发送 DELETE；服务器不支持也无妨
      if (!sessionId) return;
      try {
        await fetch(url, { method: 'DELETE', headers: await requestHeaders() });
      } catch {
        /* 尽力而为 */
      }
      sessionId = null;
    },

    handleMessage() {
      // HTTP 无服务器主动推送，空实现
    },
  };
}
