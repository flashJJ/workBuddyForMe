import { z } from 'zod';
import { ApiError } from '@wbfm/shared/errors';
import { idParamSchema } from '@wbfm/shared/schemas';
import { createWorkflowRunRepository } from '@wbfm/database';
import { defineRoute } from '@/lib/server/with-api-handler';
import { jsonOk } from '@/lib/server/api-response';
import { parseBody, parseParams, readJsonBody } from '@/lib/server/validation';

export const dynamic = 'force-dynamic';

const replaySchema = z
  .object({
    /** 省略 = 整体重跑；提供 = 从该节点重放其祖先闭包子图 */
    nodeId: z.string().trim().min(1).max(60).optional(),
  })
  .default({});

/**
 * POST /api/flows/runs/:runId/replay：整体重跑 / 从指定节点重放。
 * 重放始终为 manual 触发（从 UI 发起、可内联审批），入参沿用原 run；
 * 新 run 记录 parentRunId/resumedFromNode 关联。
 */
export const POST = defineRoute(async ({ request, params, services }) => {
  // 该路由动态段名为 runId（idParamSchema 仅校验 id 形态，此处映射改名）
  const { id: runId } = parseParams(idParamSchema, params as Record<string, string>);
  const body = parseBody(replaySchema, await readJsonBody(request));
  const repo = createWorkflowRunRepository(services.db);
  const parent = repo.getRun(runId);
  if (!parent) throw ApiError.notFound('工作流运行', runId);
  if (body.nodeId) {
    const executions = repo.listNodeExecutions(runId);
    if (!executions.some((node) => node.nodeId === body.nodeId)) {
      throw new ApiError('VALIDATION_ERROR', '重放起点节点不属于该运行');
    }
  }
  const newRunId = services.flowRunner.createRun({
    workflowId: parent.workflowId,
    input: parent.input ?? {},
    trigger: 'manual',
    replay: { parentRunId: runId, ...(body.nodeId ? { resumedFromNode: body.nodeId } : {}) },
  });
  return jsonOk({ runId: newRunId, parentRunId: runId }, 201);
});
