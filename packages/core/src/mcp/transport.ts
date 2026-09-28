import type { JsonRpcId, JsonRpcMessage, JsonRpcResponse } from './jsonrpc';

/**
 * 传输层公共契约：stdio 与 Streamable HTTP 同构。
 * client 创建晚于 transport，故用后置订阅而非构造参数。
 */
export interface McpTransport {
  /** 订阅服务端消息（请求/通知；响应由 transport 内部路由） */
  setMessageHandler(handler: (message: JsonRpcMessage) => void): void;
  /** 发送请求并等待对应响应；超时/连接已断 reject */
  request(method: string, params: unknown, timeoutMs: number): Promise<JsonRpcResponse>;
  /** 发送通知（无响应） */
  notify(method: string, params?: unknown): void;
  /** 回复服务端请求（带 id 的响应帧） */
  respond(id: JsonRpcId, result: unknown): void;
  /** 回复服务端请求的错误帧 */
  respondError(id: JsonRpcId, code: number, message: string): void;
  /** 连接是否仍可用 */
  isAlive(): boolean;
  /** 优雅断开连接/清理资源 */
  stop(): Promise<void>;
}
