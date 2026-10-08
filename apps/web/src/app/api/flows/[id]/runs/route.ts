import { flowRunCreateSchema, idParamSchema, type FlowRunCreateInput } from '@wbfm/shared/schemas';
import { defineRoute } from '@/lib/server/with-api-handler';
import { jsonOk } from '@/lib/server/api-response';
import { parseBody, parseParams, readJsonBody } from '@/lib/server/validation';

export const dynamic = 'force-dynamic';

/**
 * POST /api/flows/:id/runs：登记一次试运行（queued），返回 runId。
 * 执行由前端随后 GET /api/flows/runs/:runId/events 订阅驱动（同 tasks 模式）。
 */
export const POST = defineRoute(async ({ request, params, services }) => {
  const { id } = parseParams(idParamSchema, params);
  const body = parseBody(
    flowRunCreateSchema,
    await readJsonBody(request),
  ) as FlowRunCreateInput;
  const runId = services.flowRunner.createRun({
    workflowId: id,
    input: body.input,
    trigger: 'manual',
  });
  return jsonOk({ runId }, 201);
});
