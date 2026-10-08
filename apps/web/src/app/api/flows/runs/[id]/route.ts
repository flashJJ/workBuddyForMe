import { ApiError } from '@wbfm/shared/errors';
import { idParamSchema } from '@wbfm/shared/schemas';
import { createWorkflowRunRepository } from '@wbfm/database';
import { defineRoute } from '@/lib/server/with-api-handler';
import { jsonOk } from '@/lib/server/api-response';
import { parseParams } from '@/lib/server/validation';

export const dynamic = 'force-dynamic';

/** GET /api/flows/runs/:id：运行详情 + 逐节点执行记录（试运行面板/刷新回放用） */
export const GET = defineRoute(({ params, services }) => {
  const { id } = parseParams(idParamSchema, params);
  const repo = createWorkflowRunRepository(services.db);
  const run = repo.getRun(id);
  if (!run) throw ApiError.notFound('工作流运行', id);
  return jsonOk({
    run,
    nodes: repo.listNodeExecutions(id),
    active: services.flowRunner.isActive(id),
  });
});
