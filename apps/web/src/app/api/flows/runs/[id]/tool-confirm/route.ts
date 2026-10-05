import { ApiError, idParamSchema } from '@wbfm/shared';
import { z } from 'zod';
import { defineRoute } from '@/lib/server/with-api-handler';
import { jsonOk } from '@/lib/server/api-response';
import { parseBody, parseParams, readJsonBody } from '@/lib/server/validation';

export const dynamic = 'force-dynamic';

const confirmSchema = z.object({ nodeId: z.string().min(1), allowed: z.boolean() });

/** POST /api/flows/runs/:id/tool-confirm：write/danger 工具节点的执行授权 */
export const POST = defineRoute(async ({ request, params, services }) => {
  const { id } = parseParams(idParamSchema, params);
  const body = parseBody(confirmSchema, await readJsonBody(request));
  const ok = services.flowRunner.submitToolConfirmation(id, body.nodeId, body.allowed);
  if (!ok) throw ApiError.validation('该工具节点当前没有等待中的授权请求');
  return jsonOk({ ok: true });
});
