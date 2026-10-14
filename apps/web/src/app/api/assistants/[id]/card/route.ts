import { assistantCardAssignSchema, idParamSchema } from '@wbfm/shared/schemas';
import { defineRoute } from '@/lib/server/with-api-handler';
import { jsonOk } from '@/lib/server/api-response';
import { parseBody, parseParams, readJsonBody } from '@/lib/server/validation';

export const dynamic = 'force-dynamic';

/** 助手选卡：body { cardId: string | null }，null = 回到默认卡 */
export const PUT = defineRoute(async ({ request, params, services }) => {
  const { id } = parseParams(idParamSchema, params);
  const input = parseBody(assistantCardAssignSchema, await readJsonBody(request));
  return jsonOk(services.characterCards.assignCard(id, input.cardId));
});
