import { ApiError } from '@wbfm/shared/errors';
import { flowProductionSchema, idParamSchema } from '@wbfm/shared/schemas';
import { createWorkflowRepository } from '@wbfm/database';
import { defineRoute } from '@/lib/server/with-api-handler';
import { jsonOk } from '@/lib/server/api-response';
import { parseBody, parseParams, readJsonBody } from '@/lib/server/validation';

export const dynamic = 'force-dynamic';

/**
 * POST /api/flows/:id/production：把指定历史版本设为生产版本。
 * 只改 published_version，不改变 current_version（编辑器草稿保持原样）。
 */
export const POST = defineRoute(async ({ request, params, services }) => {
  const { id } = parseParams(idParamSchema, params);
  const { version } = parseBody(flowProductionSchema, await readJsonBody(request));
  const repo = createWorkflowRepository(services.db);
  if (!repo.getWorkflow(id)) throw ApiError.notFound('工作流', id);
  if (!repo.getVersion(id, version)) {
    throw new ApiError('FLOW_VERSION_NOT_FOUND', `工作流版本不存在：v${version}`);
  }
  const updated = repo.setProductionVersion(id, version);
  if (!updated) throw ApiError.notFound('工作流', id);
  return jsonOk(updated);
});
