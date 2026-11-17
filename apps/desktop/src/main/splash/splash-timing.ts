import fs from 'node:fs';
import path from 'node:path';

/** 启动阶段耗时记录：只写本地，不上报 */
export interface BootTimingSnapshot {
  version: string;
  mode: string;
  stages: Record<string, number>;
  totalMs: number;
}

export interface BootTimer {
  mark(stage: string): void;
  elapsed(stage?: string): number;
  snapshot(meta: { version: string; mode: string }): BootTimingSnapshot;
}

export function createBootTimer(now: () => number = () => performance.now()): BootTimer {
  const startedAt = now();
  const stages: Record<string, number> = {};
  return {
    mark(stage) {
      if (!(stage in stages)) stages[stage] = Math.round(now() - startedAt);
    },
    elapsed(stage) {
      const at = stage ? stages[stage] : undefined;
      return Math.round(at ?? now() - startedAt);
    },
    snapshot(meta) {
      return { ...meta, stages: { ...stages }, totalMs: Math.round(now() - startedAt) };
    },
  };
}

export function formatTimingLine(snapshot: BootTimingSnapshot): string {
  return JSON.stringify({ at: new Date().toISOString(), ...snapshot });
}

/** 追加一行并保留最近 maxLines 行；任何 IO 失败都静默降级 */
export function appendBootTiming(
  userDataDir: string,
  line: string,
  options: { maxLines?: number; maxBytes?: number } = {},
): string {
  const maxLines = options.maxLines ?? 20;
  const maxBytes = options.maxBytes ?? 32 * 1024;
  const file = path.join(userDataDir, 'boot-timing.log');
  try {
    const previous = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
    const lines = previous.split(/\r?\n/).filter(Boolean);
    lines.push(line);
    let next = `${lines.slice(-maxLines).join('\n')}\n`;
    if (Buffer.byteLength(next, 'utf8') > maxBytes) {
      next = `${lines.slice(-Math.max(1, Math.floor(maxLines / 2))).join('\n')}\n`;
    }
    fs.mkdirSync(userDataDir, { recursive: true });
    fs.writeFileSync(file, next, 'utf8');
  } catch {
    // 日志不可写不阻塞启动
  }
  return file;
}
