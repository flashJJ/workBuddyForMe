import {
  MEMORY_EVENT_RETENTION_DEFAULT_DAYS,
  MEMORY_EVENT_ROLLUP_META_KEY,
} from '@wbfm/shared/constants';
import {
  createMemoryEventRepository,
  getMeta,
  setMeta,
  type DatabaseInstance,
} from '@wbfm/database';

/**
 * v2.28 P1 审计轮转：
 * - 保留期内的审计原文保持逐条可查；超出保留期的事件按 (action, actor) 聚合计数后删除；
 * - retentionDays <= 0 表示永久保留（跳过轮转，不更新时间戳）；
 * - 轮转在仓储单事务内完成，失败由调用方告警，不影响启动或接口；
 * - 每次实际执行后写入 meta，设置页据此展示最近一次轮转时间。
 */
const DAY_MS = 24 * 60 * 60 * 1000;

export interface MemoryEventRollupOptions {
  /** 保留天数；0/负数 = 永久保留 */
  retentionDays?: number;
  now?: Date;
}

export interface MemoryEventRollupResult {
  skipped: boolean;
  deleted: number;
  keys: number;
  /** 轮转截止时间（ISO）；永久保留时为 null */
  cutoff: string | null;
  durationMs: number;
}

export function runMemoryEventRollup(
  db: DatabaseInstance,
  options: MemoryEventRollupOptions = {},
): MemoryEventRollupResult {
  const retentionDays = options.retentionDays ?? MEMORY_EVENT_RETENTION_DEFAULT_DAYS;
  const now = options.now ?? new Date();
  const started = Date.now();
  if (retentionDays <= 0) {
    return { skipped: true, deleted: 0, keys: 0, cutoff: null, durationMs: Date.now() - started };
  }
  const cutoff = new Date(now.getTime() - retentionDays * DAY_MS).toISOString();
  const { deleted, keys } = createMemoryEventRepository(db).rollupBefore(cutoff);
  setMeta(db, MEMORY_EVENT_ROLLUP_META_KEY, now.toISOString());
  const durationMs = Date.now() - started;
  if (deleted > 0) {
    console.info(
      `[memory] 审计轮转：删除 ${deleted} 条过期事件，聚合 ${keys} 个键，耗时 ${durationMs}ms`,
    );
  }
  return { skipped: false, deleted, keys, cutoff, durationMs };
}

/** 设置页展示：最近一次实际轮转时间（无记录为 null） */
export function readLastRollupAt(db: DatabaseInstance): string | null {
  return getMeta(db, MEMORY_EVENT_ROLLUP_META_KEY);
}
