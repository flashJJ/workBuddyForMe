import { createAgentRunRepository } from '@wbfm/database';
import { ApiError } from '@wbfm/shared/errors';
import { idParamSchema } from '@wbfm/shared/schemas';
import { defineRoute } from '@/lib/server/with-api-handler';
import { jsonOk } from '@/lib/server/api-response';
import { parseParams } from '@/lib/server/validation';

export const dynamic = 'force-dynamic';

/** GET /api/agent/runs/:id：运行详情 + handoffs（角色泳道渲染数据源） */
export const GET = defineRoute(({ params, services }) => {
  const { id } = parseParams(idParamSchema, params);
  const repo = createAgentRunRepository(services.db);
  const run = repo.getById(id);
  if (!run) throw ApiError.notFound('协作运行', id);
  return jsonOk({ run, handoffs: repo.listHandoffs(id) });
});
