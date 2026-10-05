import type { Readable, Writable } from 'node:stream';
import {
  decodeMessage,
  encodeMessage,
  JSON_RPC_ERRORS,
  type JsonRpcMessage,
  type JsonRpcResponse,
} from '../jsonrpc';
import type { McpServerContext } from './mcp-server-core';
import { handleMcpMessage } from './mcp-server-core';

/**
 * v0.9 MCP stdio 承载：stdin 按行分帧 → JSON-RPC 处理器 → stdout 单帧输出。
 * stdout 是协议通道，任何日志/错误只能走 stderr（v0.6 client 踩过的教训）。
 * 流可注入（测试喂 Pair/字符串流）；生产由桌面 bin 传 process.std*。
 */
export interface McpStdioOptions {
  context: McpServerContext;
  input?: Readable;
  output?: Writable;
  /** 诊断输出（默认 stderr）；绝不允许写入 stdout */
  logger?: (message: string) => void;
}

export interface McpStdioHandle {
  stop(): void;
}

function defaultStderrLogger(message: string): void {
  process.stderr.write(`[workbuddy-mcp] ${message}\n`);
}

export function runMcpStdio(options: McpStdioOptions): McpStdioHandle {
  const input = options.input ?? process.stdin;
  const output = options.output ?? process.stdout;
  const logger = options.logger ?? defaultStderrLogger;
  let buffer = '';
  let stopped = false;
  // 串行处理链：保证响应写出顺序与请求帧顺序严格一致
  // （直接处理的坏帧响应不得插队到 async 处理器的结果之前）
  let chain: Promise<void> = Promise.resolve();

  function writeResponse(response: JsonRpcResponse): void {
    if (stopped) return;
    try {
      output.write(encodeMessage(response));
    } catch (error) {
      logger(`写响应失败：${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async function onLine(line: string): Promise<void> {
    const message: JsonRpcMessage | null = decodeMessage(line);
    if (!message) {
      if (stopped) return;
      // 解析失败时 id 未知，按 JSON-RPC 规范回 null
      output.write(
        `${JSON.stringify({
          jsonrpc: '2.0',
          id: null,
          error: { code: JSON_RPC_ERRORS.PARSE_ERROR, message: '无法解析的 JSON-RPC 帧' },
        })}\n`,
      );
      return;
    }
    try {
      const response = await handleMcpMessage(message, options.context);
      if (response) writeResponse(response);
    } catch (error) {
      logger(`处理失败：${error instanceof Error ? error.stack ?? error.message : String(error)}`);
    }
  }

  function onChunk(chunk: Buffer | string): void {
    buffer += chunk.toString('utf8');
    let index: number;
    // 一行一帧；半行留在 buffer 等下次数据
    while ((index = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, index);
      buffer = buffer.slice(index + 1);
      if (line.trim()) {
        chain = chain.then(() => onLine(line.replace(/\r$/, '')));
      }
    }
  }

  input.on('data', onChunk);
  input.on('error', (error) => logger(`stdin 错误：${error.message}`));

  return {
    stop() {
      stopped = true;
      input.removeListener('data', onChunk);
    },
  };
}
