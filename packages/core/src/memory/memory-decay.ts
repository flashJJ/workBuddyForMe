import {
  MEMORY_DECAY_ACCESS_STALE_DAYS,
  MEMORY_DECAY_AFTER_DAYS,
  MEMORY_DECAY_INTERVAL_DAYS,
  MEMORY_DECAY_MIN_IMPORTANCE,
} from '@wbfm/shared';
import { getMeta, setMeta, type DatabaseInstance, type MemoryRepository } from '@wbfm/database';

/**
 * v0.5 P1-1 遗忘策略：
 * 又旧（创建 >30 天）、低频（从未/长期未被召回）、低重要性（<0.4）的
 * active 记忆软归档，不物理删除，管理页可恢复。借回合成功后机会执行，
 * 两次运行至少间隔 MEMORY_DECAY_INTERVAL_DAYS 天。
 */
export interface DecayResult {
  /** 本次归档条数；间隔未到跳过时为 0 */
  archived: number;
  skipped: boolean;
}

export interface DecayOptions {
  /** 忽略间隔保护（测试/手工触发） */
  force?: boolean;
  now?: Date;
}

const DECAY_META_KEY = 'memory_decay_last_run_at';
const DAY_MS = 24 * 60 * 60 * 1000;

export function runMemoryDecay(
  db: DatabaseInstance,
  repo: MemoryRepository,
  options: DecayOptions = {},
): DecayResult {
  const now = options.now ?? new Date();
  if (!options.force) {
    const lastRun = getMeta(db, DECAY_META_KEY);
    if (lastRun) {
      const elapsed = now.getTime() - new Date(lastRun).getTime();
      if (!Number.isNaN(elapsed) && elapsed < MEMORY_DECAY_INTERVAL_DAYS * DAY_MS) {
        return { archived: 0, skipped: true };
      }
    }
  }
  const iso = (offsetDays: number) => new Date(now.getTime() - offsetDays * DAY_MS).toISOString();
  const archived = repo.archiveStale({
    createdBefore: iso(MEMORY_DECAY_AFTER_DAYS),
    accessedBefore: iso(MEMORY_DECAY_ACCESS_STALE_DAYS),
    maxImportance: MEMORY_DECAY_MIN_IMPORTANCE,
  });
  setMeta(db, DECAY_META_KEY, now.toISOString());
  return { archived, skipped: false };
}
