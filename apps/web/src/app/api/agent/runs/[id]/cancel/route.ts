import { idParamSchema } from '@wbfm/shared/schemas';
import { defineRoute } from '@/lib/server/with-api-handler';
import { jsonOk } from '@/lib/server/api-response';
import { parseParams } from '@/lib/server/validation';

export const dynamic = 'force-dynamic';

/**
 * POST /api/agent/runs/:id/cancel：协作级急停（停当前角色 + Executor 子循环）。
 * - 活跃：abort 并在 1 个动作内收敛为 cancelled
 * - 未启动（running 但无订阅）：直接落 cancelled（急停早于 SSE 建连的竞态兜底）
 * - 已终态：409（状态机非法转移，由服务层拒）
 * - 不存在：404
 */
export const POST = defineRoute(({ params, services }) => {
  const { id } = parseParams(idParamSchema, params);
  // 不存在 404 / 终态 409 由服务层直接抛 ApiError
  services.agentRuns.cancel(id);
  return jsonOk({ id, cancelled: true });
});
