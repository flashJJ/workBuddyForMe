import {
  ApiError,
  idParamSchema,
  workflowVersionCreateSchema,
  type WorkflowVersionCreateInput,
} from '@wbfm/shared';
import { createWorkflowRepository } from '@wbfm/database';
import { defineRoute } from '@/lib/server/with-api-handler';
import { jsonOk } from '@/lib/server/api-response';
import { parseBody, parseParams, readJsonBody } from '@/lib/server/validation';

export const dynamic = 'force-dynamic';

/** POST /api/flows/:id/versions：保存图为新版本（草稿态版本号自增） */
export const POST = defineRoute(async ({ request, params, services }) => {
  const { id } = parseParams(idParamSchema, params);
  // 仅做 zod 结构校验；跨节点语义校验由 validate 接口/运行时编译器负责
  const body = parseBody(
    workflowVersionCreateSchema,
    await readJsonBody(request),
  ) as WorkflowVersionCreateInput;
  const repo = createWorkflowRepository(services.db);
  if (!repo.getWorkflow(id)) throw ApiError.notFound('工作流', id);
  const version = repo.addVersion(id, body.graph);
  if (!version) throw new ApiError('INTERNAL_ERROR', '版本保存失败');
  return jsonOk(version, 201);
});
