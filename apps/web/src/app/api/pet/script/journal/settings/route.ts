import { petScriptJournalSettingsSchema } from '@wbfm/shared/schemas';
import { jsonOk } from '@/lib/server/api-response';
import { parseBody, readJsonBody } from '@/lib/server/validation';
import { defineRoute } from '@/lib/server/with-api-handler';
import { createPetScriptServer } from '@/features/avatar/script/generation';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** GET /api/pet/script/journal/settings — 回顾保留天数（null = 永久保留） */
export const GET = defineRoute(({ services }) =>
  jsonOk(createPetScriptServer(services).journal.settings()),
);

/** POST /api/pet/script/journal/settings — 修改保留天数并立即裁剪旧记录 */
export const POST = defineRoute(async ({ request, services }) => {
  const input = parseBody(petScriptJournalSettingsSchema, await readJsonBody(request));
  return jsonOk(createPetScriptServer(services).journal.setRetention(input.retentionDays));
});
