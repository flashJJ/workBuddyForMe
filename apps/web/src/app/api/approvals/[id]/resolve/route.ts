import { ApiError } from '@wbfm/shared/errors';
import { approvalDecisionSchema, idParamSchema } from '@wbfm/shared/schemas';
import { defineRoute } from '@/lib/server/with-api-handler';
import { jsonOk } from '@/lib/server/api-response';
import { parseBody, parseParams, readJsonBody } from '@/lib/server/validation';

export const dynamic = 'force-dynamic';

/** POST /api/approvals/:id/resolve：一次性允许/拒绝（工具确认或 Flow 人工节点） */
export const POST = defineRoute(async ({ request, params, services }) => {
  const { id } = parseParams(idParamSchema, params);
  const input = parseBody(approvalDecisionSchema, await readJsonBody(request));
  const ok = services.approvals.resolve(id, input);
  if (!ok) throw ApiError.notFound('审批项', id);
  return jsonOk({ ok: true });
});
