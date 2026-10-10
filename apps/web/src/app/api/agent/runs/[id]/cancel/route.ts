import { ApiError } from '@wbfm/shared/errors';
import { idParamSchema } from '@wbfm/shared/schemas';
import { defineRoute } from '@/lib/server/with-api-handler';
import { jsonOk } from '@/lib/server/api-response';
import { parseParams } from '@/lib/server/validation';

export const dynamic = 'force-dynamic';

/**
 * POST /api/agent/runs/:id/cancel：协作级急停（停当前角色 + Executor 子循环）。
 * - 活跃：abort 并在 1 个动作内收敛为 cancelled
 * - 未启动（running 但无订阅）：404（同任务 control 语义）
 * - 已终态：409（状态机非法转移，由服务层拒）
 * - 不存在：404
 */
export const POST = defineRoute(({ params, services }) => {
  const { id } = parseParams(idParamSchema, params);
  const ok = services.agentRuns.cancel(id);
  if (!ok) throw ApiError.notFound('活跃协作', id);
  return jsonOk({ id, cancelled: true });
});
