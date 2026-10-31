import { auditAnchorSchema } from '@wbfm/shared/schemas';
import { verifyAuditAnchor } from '@wbfm/core/governance';
import { defineRoute } from '@/lib/server/with-api-handler';
import { jsonOk } from '@/lib/server/api-response';
import { parseBody, readJsonBody } from '@/lib/server/validation';

export const dynamic = 'force-dynamic';

/** POST /api/audit/anchor/verify：只读校验外部锚点，不写 audit_verified */
export const POST = defineRoute(async ({ request, services }) => {
  const anchor = parseBody(auditAnchorSchema, await readJsonBody(request));
  return jsonOk(verifyAuditAnchor(services.db, anchor));
});
