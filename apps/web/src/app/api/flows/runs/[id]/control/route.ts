import { ApiError } from '@wbfm/shared/errors';
import { idParamSchema } from '@wbfm/shared/schemas';
import { z } from 'zod';
import { defineRoute } from '@/lib/server/with-api-handler';
import { jsonOk } from '@/lib/server/api-response';
import { parseBody, parseParams, readJsonBody } from '@/lib/server/validation';

export const dynamic = 'force-dynamic';

const controlSchema = z.object({ action: z.enum(['cancel']) });

/** POST /api/flows/runs/:id/control：取消运行（M2 仅支持 cancel；pause/resume 随服务化 v0.9） */
export const POST = defineRoute(async ({ request, params, services }) => {
  const { id } = parseParams(idParamSchema, params);
  const body = parseBody(controlSchema, await readJsonBody(request));
  if (body.action === 'cancel') {
    const ok = services.flowRunner.cancel(id);
    if (!ok) throw ApiError.validation('运行不在进行中，无法取消');
  }
  return jsonOk({ ok: true });
});
