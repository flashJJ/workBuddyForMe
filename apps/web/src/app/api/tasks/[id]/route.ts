import { createTaskRunRepository } from '@wbfm/database';
import { ApiError, idParamSchema } from '@wbfm/shared';
import { defineRoute } from '@/lib/server/with-api-handler';
import { jsonOk } from '@/lib/server/api-response';
import { parseParams } from '@/lib/server/validation';

export const dynamic = 'force-dynamic';

/** GET /api/tasks/:id：运行 + 全部步骤（时间线回放数据源） */
export const GET = defineRoute(({ params, services }) => {
  const { id } = parseParams(idParamSchema, params);
  const repo = createTaskRunRepository(services.db);
  const run = repo.getRun(id);
  if (!run) throw ApiError.notFound('任务', id);
  return jsonOk({ run, steps: repo.listSteps(id) });
});
