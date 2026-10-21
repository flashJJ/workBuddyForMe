import { z } from 'zod';
import { ApiError } from '@wbfm/shared/errors';
import { idParamSchema, workflowCreateSchema } from '@wbfm/shared/schemas';
import { STARTER_FLOWS } from '@wbfm/core/flow';
import { createWorkflowRepository } from '@wbfm/database';
import { defineRoute } from '@/lib/server/with-api-handler';
import { jsonOk } from '@/lib/server/api-response';
import { parseBody, parseParams, readJsonBody } from '@/lib/server/validation';

export const dynamic = 'force-dynamic';

/** 请求体只有副本名称：文案（如「XX 副本」）由客户端按当前语言给出，服务端不硬编码 */
const cloneBodySchema = z.object({ name: workflowCreateSchema.shape.name });

/**
 * POST /api/flows/:id/clone：以某工作流为模板复制一份**可编辑草稿**（M0 D5）。
 * 图优先取该工作流的当前版本；若内置源已被用户删除，则回落到播种定义（STARTER_FLOWS），
 * 保证空态下「以此开始」仍可用。新副本为草稿态、新旧 id 不同，内置源只增不改。
 */
export const POST = defineRoute(async ({ request, params, services }) => {
  const { id } = parseParams(idParamSchema, params);
  const { name } = parseBody(cloneBodySchema, await readJsonBody(request));

  const repo = createWorkflowRepository(services.db);
  const source = repo.getWorkflow(id);
  const starter = STARTER_FLOWS.find((flow) => flow.id === id);
  const graph = (source ? repo.getCurrentVersion(id)?.graph : null) ?? starter?.graph ?? null;
  if (!graph) throw ApiError.notFound('工作流模板', id);

  const wf = repo.createWorkflow({
    name,
    description: source?.description ?? starter?.description ?? '',
    icon: source?.icon ?? starter?.icon,
    color: source?.color ?? starter?.color,
  });
  repo.addVersion(wf.id, graph);
  return jsonOk(wf, 201);
});
