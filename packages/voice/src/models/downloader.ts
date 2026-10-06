import path from 'node:path';
import type { VoiceModelSpec } from './manifest';
import { modelFileUrl } from './manifest';

/** 统一的取消错误（name=AbortError，兼容 DOM AbortError 判定） */
export class DownloadAbortedError extends Error {
  constructor() {
    super('模型下载已取消');
    this.name = 'AbortError';
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

/** 文件系统抽象（生产用 node:fs/promises，测试注入内存版） */
export interface FsLike {
  mkdir(dir: string, options: { recursive: boolean }): Promise<unknown>;
  writeFile(path: string, data: Uint8Array): Promise<unknown>;
  stat(path: string): Promise<{ size: number } | null>;
  rename(oldPath: string, newPath: string): Promise<unknown>;
  rm(path: string, options?: { force?: boolean }): Promise<unknown>;
}

export interface DownloadModelOptions {
  spec: VoiceModelSpec;
  /** 模型根目录（.../models/voice 下按 model id 建子目录） */
  targetRoot: string;
  /** 是否走 hf-mirror */
  mirror?: boolean;
  /** 取消信号 */
  signal?: AbortSignal;
  onProgress?: (p: DownloadProgress) => void;
  /** fetch 注入（测试用） */
  fetchImpl?: typeof fetch;
  fs?: FsLike;
}

/**
 * 下载整套语音模型。
 *
 * - 已存在且大小匹配的文件跳过（断点续传的粗粒度版本：以文件为单位）；
 * - 单文件先写 .part 临时名，成功后原子改名，避免半成品被当成就绪；
 * - signal abort → 删除 .part 并抛出 AbortError；
 * - 全部完成后由调用方 stat 复验（findMissingFiles）。
 */
export async function downloadVoiceModel(options: DownloadModelOptions): Promise<void> {
  const { spec, targetRoot, signal, onProgress, mirror = true } = options;
  const fetchImpl = options.fetchImpl ?? fetch;
  const fs = options.fs ?? defaultFs;
  const modelDir = path.join(targetRoot, spec.id);
  await fs.mkdir(modelDir, { recursive: true });

  const bytesTotal = spec.totalBytes;
  let bytesDone = 0;

  for (const file of spec.files) {
    if (signal?.aborted) throw new DownloadAbortedError();
    const dest = path.join(modelDir, file.path);
    const existing = await fs.stat(dest).catch(() => null);
    if (existing && (file.size === 0 || existing.size === file.size)) {
      bytesDone += existing.size;
      onProgress?.({
        kind: spec.kind,
        modelId: spec.id,
        bytesDone,
        bytesTotal,
        ratio: bytesTotal ? bytesDone / bytesTotal : 1,
        currentFile: file.path,
      });
      continue;
    }

    await fs.mkdir(path.dirname(dest), { recursive: true });
    const tmp = `${dest}.part`;
    await fs.rm(tmp, { force: true }).catch(() => undefined);

    onProgress?.({
      kind: spec.kind,
      modelId: spec.id,
      bytesDone,
      bytesTotal,
      ratio: bytesTotal ? bytesDone / bytesTotal : 0,
      currentFile: file.path,
    });

    const url = modelFileUrl(spec, file, mirror);
    const res = await fetchImpl(url, { signal });
    if (!res.ok || !res.body) {
      throw new Error(`下载失败 ${file.path}: HTTP ${res.status}`);
    }
    const reader = res.body.getReader();
    const chunks: Uint8Array[] = [];
    let fileBytes = 0;
    for (;;) {
      if (signal?.aborted) {
        reader.cancel().catch(() => undefined);
        await fs.rm(tmp, { force: true }).catch(() => undefined);
        throw new DownloadAbortedError();
      }
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;
      chunks.push(value);
      fileBytes += value.length;
      onProgress?.({
        kind: spec.kind,
        modelId: spec.id,
        bytesDone: bytesDone + fileBytes,
        bytesTotal,
        ratio: bytesTotal ? (bytesDone + fileBytes) / bytesTotal : 0,
        currentFile: file.path,
      });
    }
    await fs.writeFile(tmp, concatChunks(chunks));
    await fs.rename(tmp, dest);
    bytesDone += fileBytes;
  }

  onProgress?.({
    kind: spec.kind,
    modelId: spec.id,
    bytesDone,
    bytesTotal,
    ratio: 1,
    currentFile: null,
  });
}

function concatChunks(chunks: Uint8Array[]): Uint8Array {
  const total = chunks.reduce((n, c) => n + c.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    out.set(c, offset);
    offset += c.length;
  }
  return out;
}

/** 生产环境文件系统（动态引用 node:fs/promises） */
export const defaultFs: FsLike = {
  async mkdir(dir, options) {
    const fs = await import('node:fs/promises');
    return fs.mkdir(dir, options);
  },
  async writeFile(p, data) {
    const fs = await import('node:fs/promises');
    return fs.writeFile(p, data);
  },
  async stat(p) {
    const fs = await import('node:fs/promises');
    try {
      return await fs.stat(p);
    } catch {
      return null;
    }
  },
  async rename(oldPath, newPath) {
    const fs = await import('node:fs/promises');
    return fs.rename(oldPath, newPath);
  },
  async rm(p, options) {
    const fs = await import('node:fs/promises');
    return fs.rm(p, options);
  },
};
