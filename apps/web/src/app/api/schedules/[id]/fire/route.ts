import { ApiError } from '@wbfm/shared/errors';
import { idParamSchema } from '@wbfm/shared/schemas';
import { defineRoute } from '@/lib/server/with-api-handler';
import { jsonOk } from '@/lib/server/api-response';
import { parseParams } from '@/lib/server/validation';

export const dynamic = 'force-dynamic';

/**
 * v1.7 tick 第二步：幂等标记触发（once 停用，daily/weekly 推进 next_run_at）。
 * 标记成功后渲染进程再做演出/通知兜底；投递失败不回滚时刻（错过即跳过）。
 */
export const POST = defineRoute(({ params, services }) => {
  const { id } = parseParams(idParamSchema, params);
  const updated = services.schedules.markFired(id);
  if (!updated) throw ApiError.notFound('提醒', id);
  return jsonOk(updated);
});
