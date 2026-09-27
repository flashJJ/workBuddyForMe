/**
 * MCP 传输层（v0.6 M1，最小自实现）：
 * JSON-RPC 2.0 over stdio（按行分帧，与 MCP 规范一致）。
 * 选型结论：官方 SDK 依赖面过大（express/hono/jose 等服务端机器 17 包），
 * M1 只需 initialize/tools/list/tools/call 三方法 + 通知，协议面小且稳定。
 */

export type JsonRpcId = string | number;

export interface JsonRpcRequest {
  jsonrpc: '2.0';
  id: JsonRpcId;
  method: string;
  params?: unknown;
}

export interface JsonRpcNotification {
  jsonrpc: '2.0';
  method: string;
  params?: unknown;
}

export interface JsonRpcErrorObject {
  code: number;
  message: string;
  data?: unknown;
}

export interface JsonRpcResponse {
  jsonrpc: '2.0';
  id: JsonRpcId;
  result?: unknown;
  error?: JsonRpcErrorObject;
}

export type JsonRpcMessage = JsonRpcRequest | JsonRpcNotification | JsonRpcResponse;

/** 标准错误码（MCP 规范沿用 JSON-RPC 2.0） */
export const JSON_RPC_ERRORS = {
  PARSE_ERROR: -32700,
  INVALID_REQUEST: -32600,
  METHOD_NOT_FOUND: -32601,
  INVALID_PARAMS: -32602,
  INTERNAL_ERROR: -32603,
} as const;

export function isResponse(message: JsonRpcMessage): message is JsonRpcResponse {
  return 'id' in message && !('method' in message);
}

export function isRequest(message: JsonRpcMessage): message is JsonRpcRequest {
  return 'method' in message && 'id' in message;
}

export function isNotification(message: JsonRpcMessage): message is JsonRpcNotification {
  return 'method' in message && !('id' in message);
}

/** 序列化为单行 JSON（MCP stdio 分帧：一条消息一行） */
export function encodeMessage(message: JsonRpcMessage): string {
  return `${JSON.stringify(message)}\n`;
}

/** 解析单行；非法 JSON 或不是对象返回 null（调用端丢弃并计数） */
export function decodeMessage(line: string): JsonRpcMessage | null {
  const trimmed = line.trim();
  if (!trimmed) return null;
  try {
    const value: unknown = JSON.parse(trimmed);
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    const record = value as Record<string, unknown>;
    if (record.jsonrpc !== '2.0' || typeof record.method !== 'string' && record.id === undefined) {
      return null;
    }
    return value as JsonRpcMessage;
  } catch {
    return null;
  }
}

/** MCP 协议版本：客户端声明，服务端协商回落 */
export const MCP_PROTOCOL_VERSION = '2025-06-18';
