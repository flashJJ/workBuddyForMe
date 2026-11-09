/**
 * v2.33：导出核对报告收集器。
 * 每条轨道序列化完成后记录条目数、负载字节与该轨耗时；打包完成时补总字节与总耗时。
 * 报告只读展示，不参与归档格式（manifest 结构保持不变）。
 */
import type { BackupExportReport, BackupTrack } from '@wbfm/shared/backup';

/** 归档内若干个 JSON 负载的字节数（文件缺失按 0） */
export function payloadBytes(files: Record<string, string>, names: string[]): number {
  let total = 0;
  for (const name of names) {
    const content = files[name];
    if (content) total += Buffer.byteLength(content);
  }
  return total;
}

export interface ExportReporter {
  /** 记录单轨：条目数 + 该轨 JSON/二进制负载字节（耗时按与上一条的间隔计） */
  record(track: BackupTrack, entryCount: number, bytes: number): void;
  /** 收尾：totalBytes 为最终归档字节数（加密时为容器字节） */
  finish(totalBytes: number, encrypted: boolean): BackupExportReport;
}

export function createExportReporter(now: () => number = Date.now): ExportReporter {
  const startedAt = now();
  let lastAt = startedAt;
  const tracks: BackupExportReport['tracks'] = [];
  return {
    record(track, entryCount, bytes) {
      const at = now();
      tracks.push({ track, entryCount, bytes, elapsedMs: Math.max(0, at - lastAt) });
      lastAt = at;
    },
    finish(totalBytes, encrypted) {
      return { tracks, totalBytes, elapsedMs: Math.max(0, now() - startedAt), encrypted };
    },
  };
}
