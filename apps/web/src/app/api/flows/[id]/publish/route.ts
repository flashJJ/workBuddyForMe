import { ApiError } from '@wbfm/shared/errors';
import { idParamSchema } from '@wbfm/shared/schemas';
import { createWorkflowEndpointRepository, createWorkflowRepository } from '@wbfm/database';
import { defineRoute } from '@/lib/server/with-api-handler';
import { jsonOk } from '@/lib/server/api-response';
import { parseParams } from '@/lib/server/validation';

export const dynamic = 'force-dynamic';

/**
 * POST /api/flows/:id/publish：发布当前保存的版本（status=published，注册为 flow 工具）。
 * v0.9：该流程若已有对外端点，置策略待重确认标记——新版本图可能含新的危险节点，
 * 用户重新在端点设置确认策略前，公开调用返回 409 policy_revalidation_required。
 */
export const POST = defineRoute(({ params, services }) => {
  const { id } = parseParams(idParamSchema, params);
  const repo = createWorkflowRepository(services.db);
  if (!repo.getWorkflow(id)) throw ApiError.notFound('工作流', id);
  try {
    const wf = repo.publishVersion(id);
    const endpointRepo = createWorkflowEndpointRepository(services.db);
    const endpoint = endpointRepo.getByWorkflowId(id);
    if (endpoint) endpointRepo.setRevalidation(endpoint.id, true);
    return jsonOk(wf);
  } catch (error) {
    // 无版本可发布等业务错误归一为 422
    throw new ApiError('VALIDATION_ERROR', error instanceof Error ? error.message : '发布失败');
  }
});
