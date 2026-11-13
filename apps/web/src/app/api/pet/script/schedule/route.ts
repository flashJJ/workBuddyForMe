import { petScriptScheduleRequestSchema } from '@wbfm/shared/schemas';
import { jsonOk } from '@/lib/server/api-response';
import { parseBody, readJsonBody } from '@/lib/server/validation';
import { defineRoute } from '@/lib/server/with-api-handler';
import { createPetScriptServer } from '@/features/avatar/script/generation';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** POST /api/pet/script/schedule — 开关/每日次数（默认关闭、每日 5 次） */
export const POST = defineRoute(async ({ request, services }) => {
  const input = parseBody(petScriptScheduleRequestSchema, await readJsonBody(request));
  const { scheduler } = createPetScriptServer(services);
  if (input.perDay !== undefined) scheduler.setPerDay(input.perDay);
  const schedule = input.enabled !== undefined ? scheduler.setEnabled(input.enabled) : scheduler.status();
  return jsonOk({ schedule });
});
