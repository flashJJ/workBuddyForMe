import {
  MEMORY_RECALL_TOTAL_META_KEY,
  MEMORY_RECALL_ZERO_META_KEY,
} from '@wbfm/shared/constants';
import type { MemoryLifecycleStats } from '@wbfm/shared/types';
import {
  createMemoryEventRepository,
  getMeta,
  setMeta,
  type DatabaseInstance,
  type MemoryRepository,
} from '@wbfm/database';
import { readLastRollupAt } from './memory-event-rollup';

/**
 * v2.26 P2 线上计数：
 * - 零召回率 = 零召回回合数 / 召回总回合数（meta 表累计，跨重启保留）；
 * - superseded 比例 = 被取代条数 / 记忆总条数（实时查询）；
 * - 用户纠正次数 = memory_events 中 actor=user 的编辑/归档/恢复/删除条数。
 */

export function createMemoryStats(db: DatabaseInstance, repo: MemoryRepository) {
  const events = createMemoryEventRepository(db);

  function readCounter(key: string): number {
    const raw = getMeta(db, key);
    const value = raw === null ? 0 : Number(raw);
    return Number.isFinite(value) && value > 0 ? value : 0;
  }

  /** 每次召回会话调用一次：累计总次数，空结果累计零召回 */
  function recordRecall(recalled: number): void {
    setMeta(db, MEMORY_RECALL_TOTAL_META_KEY, String(readCounter(MEMORY_RECALL_TOTAL_META_KEY) + 1));
    if (recalled === 0) {
      setMeta(db, MEMORY_RECALL_ZERO_META_KEY, String(readCounter(MEMORY_RECALL_ZERO_META_KEY) + 1));
    }
  }

  function read(): MemoryLifecycleStats {
    const total = repo.count();
    const superseded = repo.count('superseded');
    const recallTotal = readCounter(MEMORY_RECALL_TOTAL_META_KEY);
    return {
      total,
      active: repo.count('active'),
      archived: repo.count('archived'),
      superseded,
      supersededRatio: ratio(superseded, total),
      recallTotal,
      zeroRecallRate: ratio(readCounter(MEMORY_RECALL_ZERO_META_KEY), recallTotal),
      userCorrections: repo.countUserCorrections(),
      recentEvents: events.listRecent(5),
      lastRollupAt: readLastRollupAt(db),
    };
  }

  return { recordRecall, read };
}

function ratio(part: number, total: number): number {
  if (total <= 0) return 0;
  return Math.round((part / total) * 1000) / 1000;
}

export type MemoryStats = ReturnType<typeof createMemoryStats>;
