import { createSessionEventRepository, type SessionEventView } from '@wbfm/database';
import type { ServiceDeps } from '../services/deps';
import { projectTimeline, type TimelineItem } from './timeline';

/**
 * v2.9 追加式事件日志服务：
 * - 事件是时间线真源，业务表仍是查询投影；
 * - 写入 best-effort（调用方错误不因日志失败而中断）；
 * - 单条载荷超过 200KB 截断并标记 truncated；
 * - 保留策略按天清理（默认 180 天）。
 */

const PAYLOAD_MAX = 200_000;
const DEFAULT_RETENTION_DAYS = 180;

export interface RecordEventInput {
  scope: SessionEventView['scope'];
  scopeId: string;
  type: string;
  payload: unknown;
  createdAt?: string;
}

function truncatePayload(payload: unknown): unknown {
  const raw = JSON.stringify(payload ?? null);
  if (raw.length <= PAYLOAD_MAX) return payload;
  return { truncated: true, preview: raw.slice(0, PAYLOAD_MAX) };
}

export function createSessionLogService(deps: ServiceDeps) {
  const repo = createSessionEventRepository(deps.db);

  const record = (input: RecordEventInput): SessionEventView | null => {
    try {
      return repo.append({
        scope: input.scope,
        scopeId: input.scopeId,
        type: input.type,
        payload: truncatePayload(input.payload),
        ...(input.createdAt ? { createdAt: input.createdAt } : {}),
      });
    } catch (error) {
      console.warn('[session-log] 事件写入失败', input.scope, input.type, error);
      return null;
    }
  };

  return {
    record,

    recordChat(
      conversationId: string,
      type: string,
      payload: unknown,
      createdAt?: string,
    ): SessionEventView | null {
      return record({
        scope: 'chat',
        scopeId: conversationId,
        type,
        payload,
        ...(createdAt ? { createdAt } : {}),
      });
    },

    timeline(
      scope: SessionEventView['scope'],
      scopeId: string,
      afterSeq = 0,
      limit = 500,
    ): { events: SessionEventView[]; items: TimelineItem[] } {
      const events = repo.list(scope, scopeId, afterSeq, limit);
      return { events, items: projectTimeline(events) };
    },

    search(
      query: string,
      filter: { scope?: SessionEventView['scope']; fromIso?: string; toIso?: string; limit?: number } = {},
    ): SessionEventView[] {
      return repo.search(query, filter);
    },

    listAll(filter: {
      scope?: SessionEventView['scope'];
      scopeId?: string;
      sinceIso?: string;
      limit?: number;
    } = {}): SessionEventView[] {
      return repo.listAll(filter);
    },

    purge(olderThanDays = DEFAULT_RETENTION_DAYS): number {
      return repo.purgeBefore(Date.now() - olderThanDays * 24 * 3600_000);
    },

    count(scope: SessionEventView['scope'], scopeId: string): number {
      return repo.count(scope, scopeId);
    },
  };
}

export type SessionLogService = ReturnType<typeof createSessionLogService>;
