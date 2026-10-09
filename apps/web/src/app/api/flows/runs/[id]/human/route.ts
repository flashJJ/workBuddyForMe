import { ApiError } from '@wbfm/shared/errors';
import {
  flowHumanSubmitSchema,
  idParamSchema,
  type FlowHumanSubmitInput,
} from '@wbfm/shared/schemas';
import { defineRoute } from '@/lib/server/with-api-handler';
import { jsonOk } from '@/lib/server/api-response';
import { parseBody, parseParams, readJsonBody } from '@/lib/server/validation';

export const dynamic = 'force-dynamic';

/** POST /api/flows/runs/:id/human：提交人工节点审核结果（approved + 表单值） */
export const POST = defineRoute(async ({ request, params, services }) => {
  const { id } = parseParams(idParamSchema, params);
  const body = parseBody(
    flowHumanSubmitSchema,
    await readJsonBody(request),
  ) as FlowHumanSubmitInput;
  const ok = services.flowRunner.submitHuman(id, body.nodeId, body);
  if (!ok) throw ApiError.validation('该人工节点当前没有等待中的审核（可能已超时或断线）');
  return jsonOk({ ok: true });
});
