import type { McpToolInfo } from '@wbfm/shared/types';
import {
  MCP_CONNECT_TIMEOUT_MS,
  MCP_LIST_TIMEOUT_MS,
  MCP_MAX_TOOLS_PER_SERVER,
} from '@wbfm/shared/constants';
import { buildMcpToolName } from '@wbfm/shared/schemas';
import { APP_VERSION } from '@wbfm/shared/version';
import {
  JSON_RPC_ERRORS,
  MCP_PROTOCOL_VERSION,
  isNotification,
  isRequest,
  type JsonRpcMessage,
} from './jsonrpc';
import type { StdioTransport } from './stdio-transport';

/** MCP 服务器 initialize 响应中的能力与信息（M1 仅登记，不做能力协商分支） */
export interface McpServerCapabilities {
  protocolVersion: string;
  serverInfo?: { name?: string; version?: string };
  tools?: { listChanged?: boolean };
}

export interface McpClientOptions {
  transport: StdioTransport;
  /** 工具列表变化（notifications/tools/list_changed）时回调 */
  onToolsChanged?: () => void;
  /** 服务端推送的通知（登记日志用） */
  onNotification?: (method: string) => void;
}

/** 最小 MCP 客户端：initialize / tools/list / tools/call（M1 协议面） */
export interface McpClient {
  /** 握手；失败时调用方负责 close */
  initialize(): Promise<McpServerCapabilities>;
  /** 发现工具（跟随分页游标，受每服务器上限保护）；qualifiedName 用 serverName 构建 */
  listTools(serverName: string): Promise<McpToolInfo[]>;
  /** 调用工具；返回文本聚合结果，isError 透传 */
  callTool(name: string, args: unknown, timeoutMs: number): Promise<McpToolCallOutcome>;
  /** 处理服务端请求/通知（由 transport 订阅转发；ping 回应，其余 method-not-found） */
  handleMessage(message: JsonRpcMessage): void;
  close(): Promise<void>;
}

export interface McpToolCallOutcome {
  ok: boolean;
  /** text content 聚合（供回灌模型） */
  output: string;
  isError: boolean;
}

interface RawTool {
  name?: unknown;
  description?: unknown;
  inputSchema?: unknown;
}

/** 把工具原始名规整为标识符安全形式（与 shared MCP_TOOL_NAME_PATTERN 对齐） */
export function sanitizeToolName(raw: string): string {
  const cleaned = raw.replace(/[^a-zA-Z0-9_-]/g, '_').replace(/^_+/, '');
  const capped = (cleaned || 'tool').slice(0, 64);
  return /^[a-zA-Z0-9_-]{1,64}$/.test(capped) ? capped : `t_${capped}`;
}

export function createMcpClient(options: McpClientOptions): McpClient {
  const { transport } = options;

  const handleMessage = (message: JsonRpcMessage) => {
    if (isRequest(message)) {
      // M1 不支持 roots/sampling 等服务端请求：ping 回空结果，其余 method-not-found
      if (message.method === 'ping') {
        transport.respond(message.id, {});
      } else {
        transport.respondError(
          message.id,
          JSON_RPC_ERRORS.METHOD_NOT_FOUND,
          `方法 ${message.method} 不被支持`,
        );
      }
      return;
    }
    if (isNotification(message)) {
      if (message.method === 'notifications/tools/list_changed') {
        options.onToolsChanged?.();
        return;
      }
      options.onNotification?.(message.method);
    }
  };

  return {
    async initialize() {
      const response = await transport.request(
        'initialize',
        {
          protocolVersion: MCP_PROTOCOL_VERSION,
          capabilities: {},
          clientInfo: { name: 'workbuddy-for-me', version: APP_VERSION },
        },
        MCP_CONNECT_TIMEOUT_MS,
      );
      if (response.error) {
        throw new Error(`MCP initialize 被拒绝：${response.error.message}`);
      }
      // 完成握手：initialized 通知（规范要求）
      transport.notify('notifications/initialized');
      const caps = (response.result ?? {}) as McpServerCapabilities;
      if (typeof caps.protocolVersion !== 'string' || !caps.protocolVersion) {
        throw new Error('MCP 服务器未返回协议版本');
      }
      return caps;
    },

    async listTools(serverName: string) {
      const tools: McpToolInfo[] = [];
      let cursor: string | undefined;
      do {
        const response = await transport.request(
          'tools/list',
          cursor ? { cursor } : {},
          MCP_LIST_TIMEOUT_MS,
        );
        if (response.error) {
          throw new Error(`tools/list 失败：${response.error.message}`);
        }
        const result = (response.result ?? {}) as { tools?: RawTool[]; nextCursor?: unknown };
        for (const raw of result.tools ?? []) {
          if (typeof raw.name !== 'string' || raw.name === '') continue;
          if (tools.length >= MCP_MAX_TOOLS_PER_SERVER) break;
          const safeName = sanitizeToolName(raw.name);
          tools.push({
            serverName,
            name: safeName,
            qualifiedName: buildMcpToolName(serverName, safeName),
            description: typeof raw.description === 'string' ? raw.description : '',
            inputSchema:
              raw.inputSchema && typeof raw.inputSchema === 'object'
                ? (raw.inputSchema as Record<string, unknown>)
                : { type: 'object', properties: {} },
          });
        }
        cursor = typeof result.nextCursor === 'string' ? result.nextCursor : undefined;
      } while (cursor && tools.length < MCP_MAX_TOOLS_PER_SERVER);
      return tools;
    },

    async callTool(name, args, timeoutMs) {
      const response = await transport.request(
        'tools/call',
        { name, arguments: args ?? {} },
        timeoutMs,
      );
      if (response.error) {
        return {
          ok: false,
          isError: true,
          output: `MCP 工具调用失败：${response.error.message}`,
        };
      }
      const result = (response.result ?? {}) as {
        content?: Array<{ type?: unknown; text?: unknown }>;
        isError?: unknown;
      };
      const output = (result.content ?? [])
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
      await transport.stop();
    },

    handleMessage,
  };
}
