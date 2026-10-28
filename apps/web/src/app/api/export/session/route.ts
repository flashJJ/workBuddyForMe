import { z } from 'zod';
import { SESSION_EVENT_SCOPES } from '@wbfm/database';
import { defineRoute } from '@/lib/server/with-api-handler';
import { parseSearch } from '@/lib/server/validation';

export const dynamic = 'force-dynamic';

const querySchema = z.object({
  scope: z.enum(SESSION_EVENT_SCOPES),
  scopeId: z.string().min(1),
  /** 1=脱敏（默认）；0=保留结构但掩码疑似令牌 */
  redact: z.enum(['0', '1']).optional(),
});

/** v2.9：导出会话/运行 ZIP（事件 + 业务投影 + manifest） */
export const GET = defineRoute(({ request, services }) => {
  const query = parseSearch(querySchema, new URL(request.url));
  const result = services.sessionExport.export({
    scope: query.scope,
    scopeId: query.scopeId,
    redact: query.redact !== '0',
  });
  return new Response(result.bytes as unknown as BodyInit, {
    headers: {
      'content-type': 'application/zip',
      'content-disposition': `attachment; filename="${result.fileName}"`,
      'cache-control': 'no-store',
    },
  });
});
