import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { StringDecoder } from 'node:string_decoder';
import { MCP_EXIT_GRACE_MS } from '@wbfm/shared';
import {
  decodeMessage,
  encodeMessage,
  isResponse,
  type JsonRpcId,
  type JsonRpcMessage,
  type JsonRpcResponse,
} from './jsonrpc';

/** stdio 子进程继承的最小环境（白名单，阻断 NODE_OPTIONS 等注入面） */
const INHERITED_ENV_KEYS = [
  'PATH',
  'PATHEXT',
  'COMSPEC',
  'SYSTEMROOT',
  'SYSTEMDRIVE',
  'WINDIR',
  'TEMP',
  'TMP',
  'APPDATA',
  'LOCALAPPDATA',
  'PROGRAMFILES',
  'HOMEDRIVE',
  'HOMEPATH',
  'USERPROFILE',
  'USERNAME',
  'USERDOMAIN',
] as const;

interface PendingRequest {
  resolve: (response: JsonRpcResponse) => void;
  reject: (error: Error) => void;
  timer: NodeJS.Timeout;
}

export interface StdioTransportOptions {
  command: string;
  args?: string[];
  env?: Record<string, string>;
  /** 进程退出或流关闭 */
  onClose?: (detail: { code: number | null; signal: NodeJS.Signals | null }) => void;
  /** 进程 stderr（诊断日志用） */
  onStderr?: (line: string) => void;
}

export interface StdioTransport {
  /**
   * 订阅服务端消息（请求/通知；响应由 transport 内部路由）。
   * client 创建晚于 transport，故用后置订阅而非构造参数。
   */
  setMessageHandler(handler: (message: JsonRpcMessage) => void): void;
  /** 发送请求并等待对应响应；超时/进程已死 reject */
  request(method: string, params: unknown, timeoutMs: number): Promise<JsonRpcResponse>;
  /** 发送通知（无响应） */
  notify(method: string, params?: unknown): void;
  /** 回复服务端请求（带 id 的响应帧） */
  respond(id: JsonRpcId, result: unknown): void;
  /** 回复服务端请求的错误帧 */
  respondError(id: JsonRpcId, code: number, message: string): void;
  /** 进程是否仍存活 */
  isAlive(): boolean;
  /** 停止子进程：kill 后等待 grace，超时强杀 */
  stop(): Promise<void>;
}

/** Windows 引号规则：反斜杠遇引号/结尾需成对（node child_process 同款规则） */
function escapeWindowsArgument(arg: string): string {
  let escaped = arg.replace(/(\\*)"/g, '$1$1\\"');
  escaped = escaped.replace(/(\\*)$/, '$1$1');
  return `"${escaped}"`;
}

/**
 * 构造 spawn 参数。Windows 上 .cmd/.bat（如全局安装的 npx）不能直接 spawn
 * （Node 安全变更后直接 EINVAL），需经 cmd /d /s /c 包装；.exe/.com 直启。
 */
export function buildSpawnCommand(
  command: string,
  args: string[],
): { file: string; args: string[]; windowsVerbatimArguments: boolean } {
  if (process.platform !== 'win32') return { file: command, args, windowsVerbatimArguments: false };
  if (/\.(exe|com)$/i.test(command)) {
    return { file: command, args, windowsVerbatimArguments: false };
  }
  const cmdline = [command, ...args].map(escapeWindowsArgument).join(' ');
  return {
    file: process.env.comspec ?? 'cmd.exe',
    args: ['/d', '/s', '/c', `"${cmdline}"`],
    windowsVerbatimArguments: true,
  };
}

function buildEnv(extra: Record<string, string>): NodeJS.ProcessEnv {
  const base: Record<string, string> = {};
  for (const key of INHERITED_ENV_KEYS) {
    const value = process.env[key];
    if (value !== undefined) base[key] = value;
  }
  // 断言而非推断：web 侧 next-env 会给 ProcessEnv 增补必填 NODE_ENV，字面量缺省会被误报
  return { ...base, ...extra } as NodeJS.ProcessEnv;
}

/** 按行分帧解码（处理 chunk 边界与 CRLF） */
export class LineDecoder {
  private decoder = new StringDecoder('utf8');
  private buffer = '';

  push(chunk: Buffer): string[] {
    this.buffer += this.decoder.write(chunk);
    return this.flushLines(false);
  }

  end(chunk?: Buffer): string[] {
    if (chunk) this.buffer += this.decoder.end(chunk);
    else this.buffer += this.decoder.end();
    return this.flushLines(true);
  }

  private flushLines(final: boolean): string[] {
    const lines: string[] = [];
    let index = this.buffer.indexOf('\n');
    while (index >= 0) {
      lines.push(this.buffer.slice(0, index).replace(/\r$/, ''));
      this.buffer = this.buffer.slice(index + 1);
      index = this.buffer.indexOf('\n');
    }
    if (final && this.buffer) {
      lines.push(this.buffer.replace(/\r$/, ''));
      this.buffer = '';
    }
    return lines;
  }
}

export function spawnStdioTransport(options: StdioTransportOptions): StdioTransport {
  const { file, args, windowsVerbatimArguments } = buildSpawnCommand(
    options.command,
    options.args ?? [],
  );
  let child: ChildProcessWithoutNullStreams;
  try {
    child = spawn(file, args, {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: buildEnv(options.env ?? {}),
      windowsHide: true,
      windowsVerbatimArguments,
    }) as ChildProcessWithoutNullStreams;
  } catch (error) {
    // spawn 同步失败（命令不存在等）：转成 onClose 语义，让上层记录失败原因
    options.onClose?.({ code: -1, signal: null });
    throw error;
  }

  const pending = new Map<JsonRpcId, PendingRequest>();
  const decoder = new LineDecoder();
  let closed = false;
  let stopped = false;
  let messageHandler: ((message: JsonRpcMessage) => void) | null = null;

  const failAllPending = (message: string) => {
    for (const entry of pending.values()) {
      clearTimeout(entry.timer);
      entry.reject(new Error(message));
    }
    pending.clear();
  };

  const handleLine = (line: string) => {
    const message = decodeMessage(line);
    if (!message) return;
    if (isResponse(message)) {
      const entry = pending.get(message.id);
      if (entry) {
        pending.delete(message.id);
        clearTimeout(entry.timer);
        entry.resolve(message);
      }
      return;
    }
    messageHandler?.(message);
  };

  child.stdout.on('data', (chunk: Buffer) => {
    for (const line of decoder.push(chunk)) handleLine(line);
  });
  child.stdout.on('end', () => {
    for (const line of decoder.end()) handleLine(line);
  });
  child.stderr.on('data', (chunk: Buffer) => {
    for (const line of chunk.toString('utf8').split('\n')) {
      const trimmed = line.trim();
      if (trimmed) options.onStderr?.(trimmed);
    }
  });

  child.on('error', (error) => {
    if (!closed) failAllPending(`MCP 进程异常：${error.message}`);
  });
  child.on('close', (code, signal) => {
    closed = true;
    failAllPending(stopped ? 'MCP 进程已停止' : `MCP 进程意外退出（code=${code ?? 'null'}）`);
    options.onClose?.({ code, signal });
  });

  return {
    setMessageHandler(handler) {
      messageHandler = handler;
    },

    async request(method, params, timeoutMs) {
      if (closed || !child.stdin.writable) {
        throw new Error('MCP 进程未运行');
      }
      const id = nextRequestId();
      const message = encodeMessage({ jsonrpc: '2.0', id, method, params });
      return new Promise<JsonRpcResponse>((resolve, reject) => {
        const timer = setTimeout(() => {
          pending.delete(id);
          reject(new Error(`MCP 请求 ${method} 超时（${Math.round(timeoutMs / 1000)}s）`));
        }, timeoutMs);
        pending.set(id, { resolve, reject, timer });
        child.stdin.write(message, (error) => {
          if (error) {
            pending.delete(id);
            clearTimeout(timer);
            reject(new Error(`MCP 请求写入失败：${error.message}`));
          }
        });
      });
    },

    notify(method, params) {
      if (closed || !child.stdin.writable) return;
      child.stdin.write(encodeMessage(params === undefined ? { jsonrpc: '2.0', method } : { jsonrpc: '2.0', method, params }));
    },

    respond(id, result) {
      if (closed || !child.stdin.writable) return;
      child.stdin.write(encodeMessage({ jsonrpc: '2.0', id, result }));
    },

    respondError(id, code, message) {
      if (closed || !child.stdin.writable) return;
      child.stdin.write(encodeMessage({ jsonrpc: '2.0', id, error: { code, message } }));
    },

    isAlive() {
      return !closed && child.exitCode === null && child.signalCode === null;
    },

    async stop() {
      if (closed) return;
      stopped = true;
      const childRef = child;
      await new Promise<void>((resolve) => {
        const killTimer = setTimeout(() => {
          childRef.kill('SIGKILL');
          resolve();
        }, MCP_EXIT_GRACE_MS);
        childRef.once('close', () => {
          clearTimeout(killTimer);
          resolve();
        });
        childRef.kill();
      });
    },
  };
}

let requestSeq = 0;
function nextRequestId(): number {
  requestSeq += 1;
  return requestSeq;
}
