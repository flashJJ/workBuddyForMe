/**
 * v1.7 用量闸门的内存实现（M1 单测/开发态）。
 * M4 由 event_usage 仓储替换：lastPlayedAt/countPlayedToday 走 SQLite 索引。
 */
import type { EventUsageWriter } from './types';
import type { EventRunOutcome } from '@wbfm/shared/schemas';

interface UsageRecord {
  eventId: string;
  playedAt: number;
  outcome: EventRunOutcome;
  reason?: string;
  priority: number;
  dateKey: string;
}

export interface InMemoryUsageStoreOptions {
  /** 本地日界换算（now 毫秒 → YYYY-MM-DD）；测试可固定 */
  toDateKey?: (nowMs: number) => string;
}

export class InMemoryEventUsageStore implements EventUsageWriter {
  private readonly records: UsageRecord[] = [];
  private readonly toDateKey: (nowMs: number) => string;

  constructor(options: InMemoryUsageStoreOptions = {}) {
    this.toDateKey = options.toDateKey ?? defaultDateKey;
  }

  lastPlayedAt(eventId: string): number | null {
    let latest: number | null = null;
    for (const r of this.records) {
      if (r.eventId === eventId && r.outcome === 'played') {
        if (latest === null || r.playedAt > latest) latest = r.playedAt;
      }
    }
    return latest;
  }

  countPlayedToday(eventId: string, dateKey: string): number {
    return this.records.filter(
      (r) => r.eventId === eventId && r.outcome === 'played' && r.dateKey === dateKey,
    ).length;
  }

  record(entry: {
    eventId: string;
    playedAt: number;
    outcome: EventRunOutcome;
    reason?: string;
    priority: number;
  }): void {
    this.records.push({ ...entry, dateKey: this.toDateKey(entry.playedAt) });
  }

  /** 测试/调试：窗口内四态计数 */
  stats(sinceMs: number): Record<EventRunOutcome, number> {
    const result: Record<EventRunOutcome, number> = {
      played: 0,
      skipped: 0,
      interrupted: 0,
      suppressed: 0,
    };
    for (const r of this.records) {
      if (r.playedAt >= sinceMs) result[r.outcome] += 1;
    }
    return result;
  }
}

/** UTC 日界（生产仓储按用户时区取日界，与 v024 date_key 约定一致） */
export function defaultDateKey(nowMs: number): string {
  return new Date(nowMs).toISOString().slice(0, 10);
}
