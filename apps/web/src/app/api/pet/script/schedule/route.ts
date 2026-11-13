import { petScriptScheduleRequestSchema } from '@wbfm/shared/schemas';
import { jsonOk } from '@/lib/server/api-response';
import { parseBody, readJsonBody } from '@/lib/server/validation';
import { defineRoute } from '@/lib/server/with-api-handler';
import { createPetScriptServer } from '@/features/avatar/script/generation';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** POST /api/pet/script/schedule — 开/关每日自动生成（默认关闭） */
export const POST = defineRoute(async ({ request, services }) => {
  const input = parseBody(petScriptScheduleRequestSchema, await readJsonBody(request));
  const schedule = createPetScriptServer(services).scheduler.setEnabled(input.enabled);
  return jsonOk({ schedule });
});
