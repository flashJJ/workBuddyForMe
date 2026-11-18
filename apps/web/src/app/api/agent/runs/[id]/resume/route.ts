import { ApiError } from '@wbfm/shared/errors';
import { idParamSchema } from '@wbfm/shared/schemas';
import { defineRoute } from '@/lib/server/with-api-handler';
import { jsonOk } from '@/lib/server/api-response';
import { parseParams } from '@/lib/server/validation';

export const dynamic = 'force-dynamic';

/**
 * POST /api/agent/runs/:id/resume：从可续跑检查点续跑。
 * 新建 run（剩余预算）并由服务端持有执行；返回新 run，客户端按新 id 观察。
 * 源 run 非 INTERRUPTED 或无检查点：409；不存在：404。
 */
export const POST = defineRoute(async ({ params, services }) => {
  const { id } = parseParams(idParamSchema, params);
  if (!services.agentRuns.hasClientsChannel()) {
    throw ApiError.notImplemented('多智能体协作通道未接通');
  }
  const run = await services.agentRuns.resume(id);
  return jsonOk(run, 201);
});
