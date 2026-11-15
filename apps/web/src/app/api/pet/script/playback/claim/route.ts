import { petScriptPlaybackClaimSchema } from '@wbfm/shared/schemas';
import { jsonOk } from '@/lib/server/api-response';
import { parseBody, readJsonBody } from '@/lib/server/validation';
import { defineRoute } from '@/lib/server/with-api-handler';
import { createPetScriptServer, quietHoursFrom } from '@/features/avatar/script/generation';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** POST /api/pet/script/playback/claim — 空闲窗口认领一场（扣预算 + 去重） */
export const POST = defineRoute(async ({ request, services }) => {
  const input = parseBody(petScriptPlaybackClaimSchema, await readJsonBody(request));
  const result = createPetScriptServer({
    ...services,
    quietHours: () => quietHoursFrom(services.settings.get()),
  }).playback.claim(input.sceneId);
  return jsonOk(result);
});
