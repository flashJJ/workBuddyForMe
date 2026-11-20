import type { McpToolInfo, PermissionLevel } from '@wbfm/shared/types';
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
  annotations?: unknown;
}

/** 把工具原始名规整为标识符安全形式（与 shared MCP_TOOL_NAME_PATTERN 对齐） */
export function sanitizeToolName(raw: string): string {
  const cleaned = raw.replace(/[^a-zA-Z0-9_-]/g, '_').replace(/^_+/, '');
  const capped = (cleaned || 'tool').slice(0, 64);
  return /^[a-zA-Z0-9_-]{1,64}$/.test(capped) ? capped : `t_${capped}`;
}

/** 净化并在本服务器内取唯一安全名：不同原始名净化后重名时追加序号 */
export function uniqueToolName(raw: string, used: Set<string>): string {
  const base = sanitizeToolName(raw);
  let safeName = base;
  let seq = 2;
  while (used.has(safeName)) {
    const suffix = `_${seq}`;
    safeName = `${base.slice(0, 64 - suffix.length)}${suffix}`;
    seq += 1;
  }
  used.add(safeName);
  return safeName;
}

/**
 * 从 tools/list 的 annotations 推导权限等级（MCP 规范提示字段）。
 * 未声明的外部工具按 write 保守处理：read 会跳过 HITL 与 plan_only 限制。
 */
export function deriveMcpToolPermission(annotations: unknown): PermissionLevel {
  if (!annotations || typeof annotations !== 'object') return 'write';
  const hints = annotations as Record<string, unknown>;
  if (hints.readOnlyHint === true) return 'read';
  if (hints.destructiveHint === true) return 'danger';
  return 'write';
}

export function createMcpClient(options: McpClientOptions): McpClient {
  const { transport } = options;
  /** 展示/模型用的安全名 → MCP 服务器上的真实工具名（含 '.' 等字符时必须还原） */
  const rawNameBySafe = new Map<string, string>();

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
      const usedSafe = new Set<string>();
      const seenCursors = new Set<string>();
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
          // 不同原始名可能净化成同一安全名（fs.read / fs_read）：追加后缀保证唯一
          const safeName = uniqueToolName(raw.name, usedSafe);
          rawNameBySafe.set(safeName, raw.name);
          tools.push({
            serverName,
            name: safeName,
            qualifiedName: buildMcpToolName(serverName, safeName),
            description: typeof raw.description === 'string' ? raw.description : '',
            inputSchema:
              raw.inputSchema && typeof raw.inputSchema === 'object'
                ? (raw.inputSchema as Record<string, unknown>)
                : { type: 'object', properties: {} },
            permission: deriveMcpToolPermission(raw.annotations),
          });
        }
        const next = typeof result.nextCursor === 'string' ? result.nextCursor : undefined;
        // 服务器重复返回同一游标（不规范实现）时终止，避免无限翻页
        if (next && seenCursors.has(next)) break;
        if (next) seenCursors.add(next);
        cursor = next;
      } while (cursor && tools.length < MCP_MAX_TOOLS_PER_SERVER);
      return tools;
    },

    async callTool(name, args, timeoutMs) {
      const response = await transport.request(
        'tools/call',
        // 模型侧看到的是安全名；真正发给服务器必须用原始名
        { name: rawNameBySafe.get(name) ?? name, arguments: args ?? {} },
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
