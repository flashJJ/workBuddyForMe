import { createHash } from 'node:crypto';
import type { VoiceModelFile } from './manifest';
import {
  DownloadAbortedError,
  DownloadHttpError,
  DownloadIntegrityError,
  DownloadRangeError,
  DownloadTimeoutError,
  type FsLike,
  type RetryPolicy,
  type TimeoutPolicy,
} from './downloader-types';

export interface DownloadFileArgs {
  file: VoiceModelFile;
  url: string;
  tmp: string;
  start: number;
  fs: FsLike;
  fetchImpl: typeof fetch;
  signal?: AbortSignal;
  retry: Required<RetryPolicy>;
  timeout: Required<TimeoutPolicy>;
  onBytes: (bytes: number) => void;
}

export async function downloadFileWithRetry(args: DownloadFileArgs): Promise<number> {
  let start = args.start;
  let lastError: unknown;

  for (let attempt = 1; attempt <= args.retry.attempts; attempt++) {
    throwIfAborted(args.signal);
    try {
      return await downloadFileAttempt({ ...args, start });
    } catch (error) {
      lastError = error;
      if (args.signal?.aborted) {
        await args.fs.rm(args.tmp, { force: true }).catch(() => undefined);
        throw new DownloadAbortedError();
      }
      if (error instanceof DownloadAbortedError) {
        await args.fs.rm(args.tmp, { force: true }).catch(() => undefined);
        throw error;
      }
      if (error instanceof DownloadIntegrityError) {
        await args.fs.rm(args.tmp, { force: true }).catch(() => undefined);
        throw error;
      }
      if (error instanceof DownloadRangeError) {
        await args.fs.rm(args.tmp, { force: true }).catch(() => undefined);
        start = 0;
        continue;
      }
      if (attempt >= args.retry.attempts || !isRetryable(error)) break;
      // 连接中断/读取失败后，.part 里已有部分数据：从实际大小继续，而不是从 0 重下。
      const part = await args.fs.stat(args.tmp).catch(() => null);
      start = part?.size ?? start;
      await sleep(retryDelayMs(attempt, args.retry, error), args.signal);
    }
  }

  throw lastError;
}

async function downloadFileAttempt(args: DownloadFileArgs): Promise<number> {
  const headers: Record<string, string> = {
    Accept: 'application/octet-stream',
    'Accept-Encoding': 'identity',
  };
  if (args.start > 0) headers.Range = `bytes=${args.start}-`;

  const controller = new AbortController();
  let requestTimedOut = false;
  const onUserAbort = (): void => controller.abort();
  args.signal?.addEventListener('abort', onUserAbort, { once: true });
  const requestTimer = setTimeout(() => {
    requestTimedOut = true;
    controller.abort();
  }, args.timeout.requestMs);

  let res: Response;
  try {
    res = await args.fetchImpl(args.url, { signal: controller.signal, headers });
  } catch (error) {
    if (args.signal?.aborted) throw new DownloadAbortedError();
    if (requestTimedOut) throw new DownloadTimeoutError();
    throw error;
  } finally {
    clearTimeout(requestTimer);
  }

  if (res.status === 416 && args.start > 0) {
    throw new DownloadRangeError();
  }
  if (!res.ok || !res.body) {
    throw new DownloadHttpError(res.status, args.url, args.file.path, parseRetryAfter(res));
  }

  let start = args.start;
  if (res.status === 200 && start > 0) {
    // 服务端忽略了 Range：清掉旧 .part，从头写。
    await args.fs.rm(args.tmp, { force: true }).catch(() => undefined);
    start = 0;
  }

  const contentType = res.headers.get('content-type') ?? '';
  if (/text\/html|application\/json/i.test(contentType)) {
    throw new DownloadIntegrityError(`下载返回了 ${contentType}，不是模型文件: ${args.file.path}`);
  }

  const contentLength = Number(res.headers.get('content-length') ?? '');
  const expectedBytes = args.file.size > 0 ? args.file.size - start : 0;
  if (
    Number.isFinite(contentLength) &&
    contentLength > 0 &&
    expectedBytes > 0 &&
    contentLength !== expectedBytes
  ) {
    throw new DownloadIntegrityError(
      `Content-Length 不符: ${args.file.path} 期望 ${expectedBytes}，实际 ${contentLength}`,
    );
  }

  const handle = await args.fs.openWrite(args.tmp, { append: start > 0 });
  const hash = start === 0 && args.file.sha256 ? createHash('sha256') : null;
  let bytes = start;

  try {
    const reader = res.body.getReader();
    for (;;) {
      throwIfAborted(args.signal);
      const { done, value } = await readWithIdleTimeout(reader, args.timeout.idleMs, controller);
      if (done) break;
      if (!value) continue;
      await handle.write(value);
      hash?.update(value);
      bytes += value.length;
      args.onBytes(bytes);
    }
  } catch (error) {
    if (args.signal?.aborted) throw new DownloadAbortedError();
    if (error instanceof DownloadTimeoutError) throw error;
    if (error instanceof Error && error.name === 'AbortError') throw new DownloadTimeoutError();
    throw error;
  } finally {
    await handle.close().catch(() => undefined);
    args.signal?.removeEventListener('abort', onUserAbort);
  }

  if (args.file.size > 0 && bytes !== args.file.size) {
    throw new DownloadIntegrityError(
      `大小不符: ${args.file.path} 期望 ${args.file.size}，实际 ${bytes}`,
    );
  }
  if (args.file.sha256) {
    const actual = hash && start === 0 ? hash.digest('hex') : await hashFile(args.tmp, args.fs);
    if (actual.toLowerCase() !== args.file.sha256.toLowerCase()) {
      throw new DownloadIntegrityError(`SHA256 不符: ${args.file.path}`);
    }
  }

  return bytes;
}

async function readWithIdleTimeout(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  idleMs: number,
  controller: AbortController,
): Promise<{ done: boolean; value?: Uint8Array }> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(new DownloadTimeoutError());
    }, idleMs);
  });
  try {
    return await Promise.race([reader.read(), timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export async function hashFile(target: string, fs: FsLike): Promise<string> {
  const hash = createHash('sha256');
  for await (const chunk of await fs.openRead(target)) hash.update(chunk);
  return hash.digest('hex');
}

function parseRetryAfter(res: Response): number | undefined {
  const raw = res.headers.get('retry-after');
  if (!raw) return undefined;
  const seconds = Number(raw);
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);
  const at = Date.parse(raw);
  return Number.isNaN(at) ? undefined : Math.max(0, at - Date.now());
}

function retryDelayMs(attempt: number, retry: Required<RetryPolicy>, error: unknown): number {
  const backoff = Math.min(retry.maxDelayMs, retry.baseDelayMs * 2 ** (attempt - 1));
  const jitter = Math.floor(Math.random() * Math.max(1, backoff * 0.2));
  const retryAfter =
    error instanceof DownloadHttpError ? Math.min(error.retryAfterMs ?? 0, 30_000) : 0;
  return Math.max(backoff + jitter, retryAfter);
}

function isRetryable(error: unknown): boolean {
  if (error instanceof DownloadTimeoutError) return true;
  if (error instanceof DownloadHttpError) return error.retryable;
  if (error instanceof DownloadIntegrityError || error instanceof DownloadAbortedError) return false;
  // fetch 网络错误、流读取中断等：交给重试上限兜底
  return true;
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw new DownloadAbortedError();
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DownloadAbortedError());
      return;
    }
    const onAbort = (): void => {
      clearTimeout(timer);
      reject(new DownloadAbortedError());
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}
