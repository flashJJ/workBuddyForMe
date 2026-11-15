import { z } from 'zod';
import { jsonOk } from '@/lib/server/api-response';
import { parseBody, readJsonBody } from '@/lib/server/validation';
import { defineRoute } from '@/lib/server/with-api-handler';
import { createPetScriptServer } from '@/features/avatar/script/generation';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const playSchema = z.object({
  sceneId: z.string().trim().min(1).max(120),
});

/** GET /api/pet/script/journal?date=YYYY-MM-DD — 某天的剧情日记（缺省今天） */
export const GET = defineRoute(({ request, services }) => {
  const date = new URL(request.url).searchParams.get('date') ?? undefined;
  return jsonOk(createPetScriptServer(services).journal.view(date));
});

/** POST /api/pet/script/journal — 场景开始播放时上报（只累加 gen.* 场景） */
export const POST = defineRoute(async ({ request, services }) => {
  const input = parseBody(playSchema, await readJsonBody(request));
  return jsonOk(createPetScriptServer(services).journal.recordPlay(input.sceneId));
});
