import { petScriptPlaybackSettingsSchema } from '@wbfm/shared/schemas';
import { jsonOk } from '@/lib/server/api-response';
import { parseBody, readJsonBody } from '@/lib/server/validation';
import { defineRoute } from '@/lib/server/with-api-handler';
import { createPetScriptServer } from '@/features/avatar/script/generation';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** GET /api/pet/script/playback — 今日主动播放预算与已播场景 */
export const GET = defineRoute(({ services }) =>
  jsonOk(createPetScriptServer(services).playback.summary()),
);

/** POST /api/pet/script/playback — 修改每日场次上限 / 空闲阈值 */
export const POST = defineRoute(async ({ request, services }) => {
  const input = parseBody(petScriptPlaybackSettingsSchema, await readJsonBody(request));
  const { playback } = createPetScriptServer(services);
  if (input.perDay !== undefined) playback.setPerDay(input.perDay);
  const summary =
    input.idleMinutes !== undefined ? playback.setIdleMinutes(input.idleMinutes) : playback.summary();
  return jsonOk(summary);
});
