import type { MemoryLifecycleStats } from '@wbfm/shared/types';
import type { ServiceDeps } from '../../../services/base/deps';
import type { createMemoryStats } from '../memory-stats';
import {
  runMemoryEventRollup,
  type MemoryEventRollupOptions,
  type MemoryEventRollupResult,
} from '../memory-event-rollup';

type MemoryStatsReader = ReturnType<typeof createMemoryStats>;

/** P2 线上计数：零召回率 / superseded 比例 / 用户纠正次数 */
export function readLifecycleStats(stats: MemoryStatsReader): MemoryLifecycleStats {
  return stats.read();
}

/** v2.28 P1：审计事件轮转（保留期外聚合计数并删除原文） */
export function runLifecycleEventRollup(
  deps: ServiceDeps,
  options: MemoryEventRollupOptions = {},
): MemoryEventRollupResult {
  return runMemoryEventRollup(deps.db, options);
}
