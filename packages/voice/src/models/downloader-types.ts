import type { VoiceModelSpec } from './manifest';

/** 统一的取消错误（name=AbortError，兼容 DOM AbortError 判定） */
export class DownloadAbortedError extends Error {
  constructor() {
    super('模型下载已取消');
    this.name = 'AbortError';
  }
}

/** 请求/读取超时（可重试） */
export class DownloadTimeoutError extends Error {
  constructor(message = '模型下载超时') {
    super(message);
    this.name = 'DownloadTimeoutError';
  }
}

/** 内容校验失败（不可重试，删除 .part） */
export class DownloadIntegrityError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DownloadIntegrityError';
  }
}

/** HTTP 错误；429/5xx/408 可重试 */
export class DownloadHttpError extends Error {
  readonly retryable: boolean;
  readonly retryAfterMs: number | undefined;

  constructor(
    readonly status: number,
    readonly url: string,
    readonly filePath: string,
    retryAfterMs?: number,
  ) {
    super(`下载失败 ${filePath}: HTTP ${status}`);
    this.name = 'DownloadHttpError';
    this.retryable = status === 408 || status === 429 || status >= 500;
    this.retryAfterMs = retryAfterMs;
  }
}

/** 416：Range 与本地 .part 不匹配，清掉 .part 后从 0 重试 */
export class DownloadRangeError extends Error {
  constructor() {
    super('Range 不匹配，重新下载');
    this.name = 'DownloadRangeError';
  }
}

/** 下载进度（bytes） */
export interface DownloadProgress {
  kind: VoiceModelSpec['kind'];
  modelId: string;
  bytesDone: number;
  bytesTotal: number;
  /** 0~1 */
  ratio: number;
  /** 当前正在下载的文件相对路径 */
  currentFile: string | null;
}

export interface WriteHandle {
  write(data: Uint8Array): Promise<void>;
  close(): Promise<void>;
}

/** 文件系统抽象（生产用 node:fs/promises，测试注入内存版） */
export interface FsLike {
  mkdir(dir: string, options: { recursive: boolean }): Promise<unknown>;
  stat(path: string): Promise<{ size: number } | null>;
  rename(oldPath: string, newPath: string): Promise<unknown>;
  rm(path: string, options?: { force?: boolean }): Promise<unknown>;
  openWrite(path: string, options: { append: boolean }): Promise<WriteHandle>;
  openRead(path: string): Promise<AsyncIterable<Uint8Array>>;
}

export interface RetryPolicy {
  /** 总尝试次数（含第一次），默认 3 */
  attempts?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
}

export interface TimeoutPolicy {
  /** 等待响应头的超时，默认 30s */
  requestMs?: number;
  /** 两次 chunk 之间的空闲超时，默认 60s */
  idleMs?: number;
}

export interface DownloadModelOptions {
  spec: VoiceModelSpec;
  /** 模型根目录（.../models/voice 下按 model id 建子目录） */
  targetRoot: string;
  /** 下载源根地址，默认 hf-mirror；传 https://huggingface.co 走官方 */
  mirrorBase?: string;
  /** 取消信号 */
  signal?: AbortSignal;
  onProgress?: (p: DownloadProgress) => void;
  /** fetch 注入（测试用） */
  fetchImpl?: typeof fetch;
  fs?: FsLike;
  retry?: RetryPolicy;
  timeout?: TimeoutPolicy;
}

export const DEFAULT_RETRY: Required<RetryPolicy> = {
  attempts: 3,
  baseDelayMs: 500,
  maxDelayMs: 8_000,
};

export const DEFAULT_TIMEOUT: Required<TimeoutPolicy> = {
  requestMs: 30_000,
  idleMs: 60_000,
};
