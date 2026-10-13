import {
  eventUsageAppendSchema,
  eventUsageSnapshotQuerySchema,
} from '@wbfm/shared/schemas';
import type { EventUsageSnapshotEntry } from '@wbfm/core/event';
import { defineRoute } from '@/lib/server/with-api-handler';
import { jsonOk } from '@/lib/server/api-response';
import { parseBody, parseSearch, readJsonBody } from '@/lib/server/validation';

export const dynamic = 'force-dynamic';

/**
 * v1.7 演出用量：渲染进程导演挂载时拉一次当日快照（冷却/每日上限闸门）。
 * 快照单次往返返回每剧本 lastPlayedAt(ISO)+playedToday。
 */
export const GET = defineRoute(({ request, services }) => {
  const { assistantId, dateKey } = parseSearch(
    eventUsageSnapshotQuerySchema,
    new URL(request.url),
  );
  const items = services.eventUsage
    .snapshot(assistantId, dateKey)
    .map((entry: EventUsageSnapshotEntry) => ({
      eventId: entry.eventId,
      lastPlayedAt: entry.lastPlayedAt === null ? null : new Date(entry.lastPlayedAt).toISOString(),
      playedToday: entry.playedToday,
    }));
  return jsonOk({ assistantId, dateKey, items });
});

/** 终态流水追加（played/skipped/interrupted/suppressed；suppressed 原因码白名单校验在仓储） */
export const POST = defineRoute(async ({ request, services }) => {
  const input = parseBody(eventUsageAppendSchema, await readJsonBody(request));
  services.eventUsage.append(input.assistantId, {
    eventId: input.eventId,
    dateKey: input.dateKey,
    playedAtMs: Date.parse(input.playedAt),
    outcome: input.outcome,
    reason: input.reason ?? null,
    priority: input.priority,
  });
  return jsonOk({ recorded: true }, 201);
});
