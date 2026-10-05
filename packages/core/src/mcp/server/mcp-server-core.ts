import {
  JSON_RPC_ERRORS,
  MCP_PROTOCOL_VERSION,
  type JsonRpcId,
  type JsonRpcMessage,
  type JsonRpcNotification,
  type JsonRpcRequest,
  type JsonRpcResponse,
} from '../jsonrpc';
import type { McpToolDescriptor } from './describe-tool';

/**
 * v0.9 MCP Server 纯处理器（传输无关）：
 * stdio 行帧与 streamable HTTP 都把解析后的 JSON-RPC 消息喂给 handleMcpMessage。
 * 最小方法集：initialize / notifications/initialized / tools/list / tools/call / ping。
 */

export interface McpCallResult {
  /** MCP content（v1 仅 text） */
  content: Array<{ type: 'text'; text: string }>;
  /** 业务失败（流程失败/拒绝）置 true；传输/协议错误走 JSON-RPC error */
  isError?: boolean;
}

/** callTool 实现用：入参非法时抛出，处理器转为 -32602 并带字段详情 */
export class McpInvalidParamsError extends Error {
  readonly details: unknown;
  constructor(details: unknown) {
    super('MCP tools/call 参数校验失败');
    this.name = 'McpInvalidParamsError';
    this.details = details;
  }
}

export interface McpServerContext {
  serverInfo: { name: string; version: string };
  listTools(): Promise<McpToolDescriptor[]>;
  /** 按工具名调用；未知工具名返回 null（处理器转 -32602） */
  callTool(name: string, args: Record<string, unknown>): Promise<McpCallResult | null>;
}

/** 服务端可协商的协议版本（新增在前）；不在清单的客户端版本回落为服务端当前版本 */
const SUPPORTED_PROTOCOL_VERSIONS = [MCP_PROTOCOL_VERSION, '2024-11-05'];

function rpcResult(id: JsonRpcId | null, result: unknown): JsonRpcResponse {
  return { jsonrpc: '2.0', id, result };
}

function rpcError(id: JsonRpcId | null, code: number, message: string, data?: unknown): JsonRpcResponse {
  return { jsonrpc: '2.0', id, error: { code, message, ...(data ? { data } : {}) } };
}

function isRequest(message: JsonRpcMessage): message is JsonRpcRequest {
  return 'method' in message && 'id' in message;
}

function isNotification(message: JsonRpcMessage): message is JsonRpcNotification {
  return 'method' in message && !('id' in message);
}

/**
 * 处理一条 JSON-RPC 消息：
 * - 通知返回 null（无响应，adapter 不写任何帧）；
 * - 请求返回响应对象；处理器自身异常归一为 -32603，不向传输层抛出。
 */
export async function handleMcpMessage(
  message: JsonRpcMessage,
  ctx: McpServerContext,
): Promise<JsonRpcResponse | null> {
  if (isNotification(message)) {
    // initialized 是唯一需要消费的通知；其余通知静默忽略
    return null;
  }
  if (!isRequest(message)) {
    return rpcError(
      (message as { id?: JsonRpcId }).id ?? null,
      JSON_RPC_ERRORS.INVALID_REQUEST,
      '不是合法的 JSON-RPC 请求',
    );
  }
  const { id, method, params } = message;
  try {
    switch (method) {
      case 'initialize': {
        const clientVersion =
          params && typeof params === 'object' &&
          typeof (params as { protocolVersion?: unknown }).protocolVersion === 'string'
            ? ((params as { protocolVersion: string }).protocolVersion)
            : null;
        const protocolVersion =
          clientVersion && SUPPORTED_PROTOCOL_VERSIONS.includes(clientVersion)
            ? clientVersion
            : MCP_PROTOCOL_VERSION;
        return rpcResult(id, {
          protocolVersion,
          capabilities: { tools: { listChanged: false } },
          serverInfo: ctx.serverInfo,
        });
      }
      case 'ping':
        return rpcResult(id, {});
      case 'tools/list': {
        const tools = await ctx.listTools();
        // v1 数量少不做分页：始终省略 nextCursor
        return rpcResult(id, { tools: tools.map(({ workflowId: _workflowId, ...wire }) => wire) });
      }
      case 'tools/call': {
        const callParams = params as { name?: unknown; arguments?: unknown } | undefined;
        if (
          !callParams ||
          typeof callParams !== 'object' ||
          typeof callParams.name !== 'string' ||
          (callParams.arguments !== undefined &&
            (typeof callParams.arguments !== 'object' || callParams.arguments === null || Array.isArray(callParams.arguments)))
        ) {
          return rpcError(id, JSON_RPC_ERRORS.INVALID_PARAMS, 'tools/call 需要 {name:string, arguments?:object}');
        }
        const args = (callParams.arguments ?? {}) as Record<string, unknown>;
        const result = await ctx.callTool(callParams.name, args);
        if (!result) {
          return rpcError(id, JSON_RPC_ERRORS.INVALID_PARAMS, `未知的工具：${callParams.name}`);
        }
        return rpcResult(id, result);
      }
      default:
        return rpcError(id, JSON_RPC_ERRORS.METHOD_NOT_FOUND, `方法不存在：${method}`);
    }
  } catch (error) {
    // name 兜底：transpilePackages 多 chunk 下 instanceof 可能失配
    const invalidParams =
      error instanceof McpInvalidParamsError ||
      (error && typeof error === 'object' &&
        (error as { name?: unknown }).name === 'McpInvalidParamsError');
    if (invalidParams) {
      const candidate = error as McpInvalidParamsError;
      return rpcError(
        id,
        JSON_RPC_ERRORS.INVALID_PARAMS,
        candidate.message,
        candidate.details,
      );
    }
    return rpcError(
      id,
      JSON_RPC_ERRORS.INTERNAL_ERROR,
      error instanceof Error ? error.message : 'MCP 处理器内部错误',
    );
  }
}
