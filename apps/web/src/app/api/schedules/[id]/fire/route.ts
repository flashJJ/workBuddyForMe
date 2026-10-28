import { ApiError } from '@wbfm/shared/errors';
import { idParamSchema } from '@wbfm/shared/schemas';
import { defineRoute } from '@/lib/server/with-api-handler';
import { jsonOk } from '@/lib/server/api-response';
import { parseParams } from '@/lib/server/validation';

export const dynamic = 'force-dynamic';

/**
 * v1.7 tick 第二步：幂等标记触发（once 停用，daily/weekly 推进 next_run_at）。
 * v2.8：payload.kind=follow_up 时在标记成功后向会话注入一条助手消息
 * （幂等键 = 提醒 id + 本次预定时刻，重复调用不重复注入）。
 */
export const POST = defineRoute(({ params, services }) => {
  const { id } = parseParams(idParamSchema, params);
  const before = services.schedules.get(id);
  const updated = services.schedules.markFired(id);
  if (!updated) throw ApiError.notFound('提醒', id);

  // 只在「确实到点」时注入跟进消息：多标签页竞争 fire 时，后到的一次
  // before.nextRunAt 已是未来时刻，不能算作一次新投递
  const due = Date.parse(before.nextRunAt) <= Date.now() && before.enabled;
  if (due && updated.payload?.kind === 'follow_up') {
    const conversationId = updated.payload.conversationId;
    if (conversationId) {
      services.completions.completeFollowUp({
        scheduleId: id,
        occurrenceAt: before.nextRunAt,
        conversationId,
        text: updated.text,
      });
    }
  }
  return jsonOk(updated);
});
