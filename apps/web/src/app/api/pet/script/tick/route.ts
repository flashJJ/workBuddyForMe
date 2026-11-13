import { jsonOk } from '@/lib/server/api-response';
import { defineRoute } from '@/lib/server/with-api-handler';
import { createPetScriptServer } from '@/features/avatar/script/generation';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** POST /api/pet/script/tick — 客户端心跳：到期才生成，未到期/关闭零副作用 */
export const POST = defineRoute(async ({ services }) => {
  const result = await createPetScriptServer(services).scheduler.tick();
  return jsonOk(result);
});
