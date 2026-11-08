import {
  MEMORY_DECAY_INTERVAL_DAYS,
  MEMORY_DECAY_MIN_AGE_DAYS,
  MEMORY_DECAY_SCAN_LIMIT,
  MEMORY_DECAY_TIERS,
  MEMORY_DECAY_USAGE_BASE,
  MEMORY_DECAY_USAGE_STEP,
} from '@wbfm/shared/constants';
import type { Memory } from '@wbfm/shared/types';
import { getMeta, setMeta, type DatabaseInstance, type MemoryRepository } from '@wbfm/database';
import { recencyScore } from './lifecycle/memory-retriever';

/**
 * v2.26 P2 遗忘策略（周任务）：
 * decay_score = importance × recency × usage，按年龄分档归档。
 * - recency 复用召回侧半衰期（事实/偏好 180d、事件 60d、共同经历 365d）；
 * - usage 由召回次数决定：0 次 0.3，每次 +0.2，上限 1；
 * - 30 天内不归档，之后按 30-90 / 90-180 / 180+ 天三档逐步提高阈值；
 * - 只归档不删除（status=archived，管理页可恢复），置顶与 constraint 不参与；
 * - TTL 到期（ttl_at）的记忆每次运行都会先归档，不受 7 天间隔限制。
 */
export interface DecayResult {
  /** 本次按衰减分数归档条数；间隔未到时为 0 */
  archived: number;
  /** 本次 TTL 到期归档条数（间隔保护不影响） */
  expired: number;
  /** 分数衰减任务因间隔未到而跳过 */
  skipped: boolean;
}

export interface DecayOptions {
  /** 忽略间隔保护（测试/手工触发） */
  force?: boolean;
  now?: Date;
}

const DECAY_META_KEY = 'memory_decay_last_run_at';
const DAY_MS = 24 * 60 * 60 * 1000;

/** 使用频次分：从未召回仍有基础保留值，召回越多越抗衰 */
export function memoryUsageScore(recallCount: number): number {
  return Math.min(1, MEMORY_DECAY_USAGE_BASE + MEMORY_DECAY_USAGE_STEP * Math.max(0, recallCount));
}

export function memoryAgeDays(memory: Memory, now: Date): number {
  const created = Date.parse(memory.createdAt);
  if (Number.isNaN(created)) return 0;
  return Math.max(0, (now.getTime() - created) / DAY_MS);
}

/** 年龄分档阈值：年龄不足 30 天返回 null（永不因衰减归档） */
export function decayThreshold(ageDays: number): number | null {
  if (ageDays < MEMORY_DECAY_MIN_AGE_DAYS) return null;
  const tier =
    MEMORY_DECAY_TIERS.find((item) => ageDays < item.maxAgeDays) ??
    MEMORY_DECAY_TIERS[MEMORY_DECAY_TIERS.length - 1]!;
  return tier.threshold;
}

export function decayScore(memory: Memory, now: Date): number {
  const score = memory.importance * recencyScore(memory, now) * memoryUsageScore(memory.recallCount);
  return Math.round(score * 10000) / 10000;
}

/** 是否应因衰减归档：按年龄段阈值比较 decay_score */
export function shouldArchiveByDecay(memory: Memory, now: Date): boolean {
  const threshold = decayThreshold(memoryAgeDays(memory, now));
  if (threshold === null) return false;
  return decayScore(memory, now) < threshold;
}

export function runMemoryDecay(
  db: DatabaseInstance,
  repo: MemoryRepository,
  options: DecayOptions = {},
): DecayResult {
  const now = options.now ?? new Date();
  const expired = repo.archiveExpired(now.toISOString());
  if (!options.force) {
    const lastRun = getMeta(db, DECAY_META_KEY);
    if (lastRun) {
      const elapsed = now.getTime() - new Date(lastRun).getTime();
      if (!Number.isNaN(elapsed) && elapsed < MEMORY_DECAY_INTERVAL_DAYS * DAY_MS) {
        return { archived: 0, expired, skipped: true };
      }
    }
  }
  const candidates = repo.listDecayCandidates(MEMORY_DECAY_SCAN_LIMIT);
  const archived = repo.archiveByIds(
    candidates.filter((memory) => shouldArchiveByDecay(memory, now)).map((memory) => memory.id),
  );
  setMeta(db, DECAY_META_KEY, now.toISOString());
  return { archived, expired, skipped: false };
}
