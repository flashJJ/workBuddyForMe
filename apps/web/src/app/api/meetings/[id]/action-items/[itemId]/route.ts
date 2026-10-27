import { idParamSchema, meetingActionItemUpdateSchema } from '@wbfm/shared/schemas';
import { z } from 'zod';
import { jsonOk } from '@/lib/server/api-response';
import { defineRoute } from '@/lib/server/with-api-handler';
import { parseBody, parseParams, readJsonBody } from '@/lib/server/validation';

export const dynamic = 'force-dynamic';

const paramsSchema = z.object({
  id: idParamSchema.shape.id,
  itemId: idParamSchema.shape.id,
});

/** PATCH /api/meetings/:id/action-items/:itemId：内容/负责人/截止时间/状态 */
export const PATCH = defineRoute(async ({ request, params, services }) => {
  const { id, itemId } = parseParams(paramsSchema, params);
  const input = parseBody(meetingActionItemUpdateSchema, await readJsonBody(request));
  return jsonOk(services.meetings.updateActionItem(id, itemId, input));
});
