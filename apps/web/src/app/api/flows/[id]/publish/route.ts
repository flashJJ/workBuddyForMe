import { ApiError, idParamSchema } from '@wbfm/shared';
import { createWorkflowRepository } from '@wbfm/database';
import { defineRoute } from '@/lib/server/with-api-handler';
import { jsonOk } from '@/lib/server/api-response';
import { parseParams } from '@/lib/server/validation';

export const dynamic = 'force-dynamic';

/** POST /api/flows/:id/publish：发布当前版本（status=published，注册为 flow 工具） */
export const POST = defineRoute(({ params, services }) => {
  const { id } = parseParams(idParamSchema, params);
  const repo = createWorkflowRepository(services.db);
  if (!repo.getWorkflow(id)) throw ApiError.notFound('工作流', id);
  try {
    const wf = repo.publishVersion(id);
    return jsonOk(wf);
  } catch (error) {
    // 无版本可发布等业务错误归一为 422
    throw new ApiError('VALIDATION_ERROR', error instanceof Error ? error.message : '发布失败');
  }
});
