import { petScriptGenerationRequestSchema } from '@wbfm/shared/schemas';
import { jsonOk } from '@/lib/server/api-response';
import { parseBody, readJsonBody } from '@/lib/server/validation';
import { defineRoute } from '@/lib/server/with-api-handler';
import { createPetScriptServer } from '@/features/avatar/script/generation';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** GET /api/pet/script — 生成队列 + 今日用量 + 剧情摘要 + 自动生成状态 */
export const GET = defineRoute(({ services }) =>
  jsonOk(createPetScriptServer(services).scheduler.view()),
);

/** POST /api/pet/script — 生成一条受限剧本（失败回落本地池） */
export const POST = defineRoute(async ({ request, services }) => {
  const input = parseBody(petScriptGenerationRequestSchema, await readJsonBody(request));
  return jsonOk(await createPetScriptServer(services).generator.generate(input));
});
