import { ApiError } from '@wbfm/shared/errors';
import {
  idParamSchema,
  workflowVersionCreateSchema,
  type WorkflowVersionCreateInput,
} from '@wbfm/shared/schemas';
import { createWorkflowRepository } from '@wbfm/database';
import { defineRoute } from '@/lib/server/with-api-handler';
import { jsonOk } from '@/lib/server/api-response';
import { parseBody, parseParams, readJsonBody } from '@/lib/server/validation';

export const dynamic = 'force-dynamic';

/** GET /api/flows/:id/versions：版本列表（倒序，含 production 标记） */
export const GET = defineRoute(({ params, services }) => {
  const { id } = parseParams(idParamSchema, params);
  const repo = createWorkflowRepository(services.db);
  const wf = repo.getWorkflow(id);
  if (!wf) throw ApiError.notFound('工作流', id);
  const versions = repo
    .listVersions(id)
    .map((version) => ({ ...version, production: version.version === wf.publishedVersion }));
  return jsonOk(versions);
});

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
