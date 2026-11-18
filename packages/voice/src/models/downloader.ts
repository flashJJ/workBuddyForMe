import path from 'node:path';
import { HF_MIRROR_BASE, modelFileUrl } from './manifest';
import { defaultFs } from './downloader-fs';
import { downloadFileWithRetry, hashFile } from './downloader-http';
import {
  DEFAULT_RETRY,
  DEFAULT_TIMEOUT,
  DownloadAbortedError,
  type DownloadModelOptions,
} from './downloader-types';

export * from './downloader-types';
export { defaultFs } from './downloader-fs';

/**
 * 下载整套语音模型。
 *
 * - 已存在且大小匹配的文件跳过（有 sha256 时先校验哈希）；
 * - `.part` 支持 Range 续传；单文件失败重试 + 退避；
 * - 流式写盘，不再把整个大文件读进内存；
 * - 有 sha256 的大文件边写边算，或续传后整文件复算；
 * - 取消删除 .part；网络失败保留 .part 供下次续传。
 */
export async function downloadVoiceModel(options: DownloadModelOptions): Promise<void> {
  const { spec, targetRoot, signal, onProgress } = options;
  const fetchImpl = options.fetchImpl ?? fetch;
  const fs = options.fs ?? defaultFs;
  const mirrorBase = options.mirrorBase ?? HF_MIRROR_BASE;
  const retry = { ...DEFAULT_RETRY, ...options.retry };
  const timeout = { ...DEFAULT_TIMEOUT, ...options.timeout };
  const modelDir = path.join(targetRoot, spec.id);
  await fs.mkdir(modelDir, { recursive: true });

  const bytesTotal = spec.totalBytes || spec.files.reduce((sum, file) => sum + file.size, 0);
  let bytesDone = 0;

  const emit = (done: number, currentFile: string | null): void => {
    onProgress?.({
      kind: spec.kind,
      modelId: spec.id,
      bytesDone: done,
      bytesTotal,
      ratio: bytesTotal ? Math.min(1, done / bytesTotal) : 1,
      currentFile,
    });
  };

  for (const file of spec.files) {
    throwIfAborted(signal);
    const dest = path.join(modelDir, file.path);
    const existing = await fs.stat(dest).catch(() => null);
    if (existing && (file.size === 0 || existing.size === file.size)) {
      if (file.sha256 && existing.size === file.size) {
        const actual = await hashFile(dest, fs);
        if (actual.toLowerCase() === file.sha256.toLowerCase()) {
          bytesDone += existing.size;
          emit(bytesDone, file.path);
          continue;
        }
        await fs.rm(dest, { force: true });
      } else {
        bytesDone += existing.size;
        emit(bytesDone, file.path);
        continue;
      }
    }
    if (existing && file.size > 0 && existing.size !== file.size) {
      await fs.rm(dest, { force: true });
    }

    await fs.mkdir(path.dirname(dest), { recursive: true });
    const tmp = `${dest}.part`;
    const part = await fs.stat(tmp).catch(() => null);
    let start = part?.size ?? 0;
    if (file.size > 0 && start > file.size) {
      await fs.rm(tmp, { force: true });
      start = 0;
    }
    if (file.size > 0 && start === file.size) {
      const actual = file.sha256 ? await hashFile(tmp, fs) : null;
      if (!file.sha256 || actual?.toLowerCase() === file.sha256.toLowerCase()) {
        await fs.rename(tmp, dest);
        bytesDone += start;
        emit(bytesDone, file.path);
        continue;
      }
      await fs.rm(tmp, { force: true });
      start = 0;
    }

    emit(bytesDone + start, file.path);
    const bytes = await downloadFileWithRetry({
      file,
      url: modelFileUrl(spec, file, mirrorBase),
      tmp,
      start,
      fs,
      fetchImpl,
      signal,
      retry,
      timeout,
      onBytes: (n) => emit(bytesDone + n, file.path),
    });
    await fs.rename(tmp, dest);
    bytesDone += bytes;
    emit(bytesDone, file.path);
  }

  emit(bytesTotal, null);
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw new DownloadAbortedError();
}
