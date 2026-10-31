import { ApiError } from '@wbfm/shared/errors';
import { flowVersionCompareQuerySchema, idParamSchema } from '@wbfm/shared/schemas';
import { createWorkflowRepository } from '@wbfm/database';
import { diffFlowGraphs } from '@wbfm/core/flow';
import { defineRoute } from '@/lib/server/with-api-handler';
import { jsonOk } from '@/lib/server/api-response';
import { parseParams, parseSearch } from '@/lib/server/validation';

export const dynamic = 'force-dynamic';

/** GET /api/flows/:id/versions/compare?from=1&to=2：只读版本差异摘要 */
export const GET = defineRoute(({ request, params, services }) => {
  const { id } = parseParams(idParamSchema, params);
  const query = parseSearch(flowVersionCompareQuerySchema, new URL(request.url));
  const repo = createWorkflowRepository(services.db);
  if (!repo.getWorkflow(id)) throw ApiError.notFound('工作流', id);

  const from = repo.getVersion(id, query.from);
  if (!from) throw new ApiError('FLOW_VERSION_NOT_FOUND', `工作流版本 ${query.from} 不存在`);
  const to = repo.getVersion(id, query.to);
  if (!to) throw new ApiError('FLOW_VERSION_NOT_FOUND', `工作流版本 ${query.to} 不存在`);

  return jsonOk(diffFlowGraphs(query.from, query.to, from.graph, to.graph));
});
