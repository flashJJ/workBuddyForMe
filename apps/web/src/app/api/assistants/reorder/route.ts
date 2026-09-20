import { assistantReorderSchema } from '@wbfm/shared';
import { defineRoute } from '@/lib/server/with-api-handler';
import { jsonOk } from '@/lib/server/api-response';
import { parseBody, readJsonBody } from '@/lib/server/validation';

export const dynamic = 'force-dynamic';

/** 全量排序：orderedIds 必须与现有助手集合完全一致 */
export const POST = defineRoute(async ({ request, services }) => {
  const input = parseBody(assistantReorderSchema, await readJsonBody(request));
  services.assistants.reorder(input.orderedIds);
  return jsonOk({ orderedIds: input.orderedIds });
});
