/**
 * v1.7 演出用量服务：event_usage 仓储薄封装（冷却/每日上限/打扰率）。
 * 渲染进程导演经 HTTP 快照+记录使用，服务端也在备份/统计处直接调用。
 */
import {
  createEventUsageRepository,
  type AppendEventUsageInput,
  type EventUsageRepository,
  type EventUsageStats,
} from '@wbfm/database';
import type { ServiceDeps } from '../services/deps';

/** 启动时清理的流水保留期：90 天 */
export const EVENT_USAGE_RETENTION_MS = 90 * 24 * 3600_000;

export interface EventUsageSnapshotEntry {
  eventId: string;
  lastPlayedAt: number | null;
  playedToday: number;
}

export function createEventUsageService(deps: ServiceDeps) {
  const repo: EventUsageRepository = createEventUsageRepository(deps.db);

  return {
    append(assistantId: string, input: Omit<AppendEventUsageInput, 'id'>): void {
      repo.append(assistantId, input);
    },
    snapshot(assistantId: string, dateKey: string): EventUsageSnapshotEntry[] {
      return repo.snapshot(assistantId, dateKey);
    },
    stats(assistantId: string, windowDays = 30): EventUsageStats {
      return repo.stats(assistantId, Date.now() - windowDays * 24 * 3600_000);
    },
    /** 应用启动清理：返回删除条数 */
    purgeOld(now: number = Date.now()): number {
      return repo.purgeBefore(now - EVENT_USAGE_RETENTION_MS);
    },
    repo,
  };
}

export type EventUsageService = ReturnType<typeof createEventUsageService>;
