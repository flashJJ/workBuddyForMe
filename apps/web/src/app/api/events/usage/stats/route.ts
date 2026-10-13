import { eventUsageStatsQuerySchema, type EventUsageStatsView } from '@wbfm/shared/schemas';
import { defineRoute } from '@/lib/server/with-api-handler';
import { jsonOk } from '@/lib/server/api-response';
import { parseSearch } from '@/lib/server/validation';

export const dynamic = 'force-dynamic';

/** v1.7 打扰率只读统计：四态计数 + 接受率/打断率（无数据 null） */
export const GET = defineRoute(({ request, services }) => {
  const { assistantId, windowDays } = parseSearch(
    eventUsageStatsQuerySchema,
    new URL(request.url),
  );
  const counts = services.eventUsage.stats(assistantId, windowDays);
  const judged = counts.played + counts.skipped;
  const view: EventUsageStatsView = {
    played: counts.played,
    skipped: counts.skipped,
    interrupted: counts.interrupted,
    suppressed: counts.suppressed,
    acceptRate: judged === 0 ? null : counts.played / judged,
    interruptRate: counts.played === 0 ? null : counts.interrupted / counts.played,
  };
  return jsonOk(view);
});
