import { ApiError, idParamSchema, workflowUpdateSchema } from '@wbfm/shared';
import { createWorkflowRepository } from '@wbfm/database';
import { defineRoute } from '@/lib/server/with-api-handler';
import { jsonOk } from '@/lib/server/api-response';
import { parseBody, parseParams, readJsonBody } from '@/lib/server/validation';

export const dynamic = 'force-dynamic';

/** GET /api/flows/:id：工作流详情 + 当前版本图（无版本时 graph 为 null） */
export const GET = defineRoute(({ params, services }) => {
  const { id } = parseParams(idParamSchema, params);
  const repo = createWorkflowRepository(services.db);
  const wf = repo.getWorkflow(id);
  if (!wf) throw ApiError.notFound('工作流', id);
  const version = repo.getCurrentVersion(id);
  return jsonOk({ workflow: wf, graph: version?.graph ?? null, version: version?.version ?? 0 });
});

/** PATCH /api/flows/:id：更新元信息（改名/描述/图标/配色） */
export const PATCH = defineRoute(async ({ request, params, services }) => {
  const { id } = parseParams(idParamSchema, params);
  const body = parseBody(workflowUpdateSchema, await readJsonBody(request));
  const wf = createWorkflowRepository(services.db).updateWorkflow(id, body);
  if (!wf) throw ApiError.notFound('工作流', id);
  return jsonOk(wf);
});

/** DELETE /api/flows/:id：级联删除版本/运行/节点执行 */
export const DELETE = defineRoute(({ params, services }) => {
  const { id } = parseParams(idParamSchema, params);
  createWorkflowRepository(services.db).deleteWorkflow(id);
  return jsonOk({ id });
});
