import {
  idParamSchema,
  meetingActionItemReminderSchema,
} from '@wbfm/shared/schemas';
import { z } from 'zod';
import { jsonOk } from '@/lib/server/api-response';
import { defineRoute } from '@/lib/server/with-api-handler';
import { parseBody, parseParams, readJsonBody } from '@/lib/server/validation';

export const dynamic = 'force-dynamic';

const paramsSchema = z.object({
  id: idParamSchema.shape.id,
  itemId: idParamSchema.shape.id,
});

/** POST /api/meetings/:id/action-items/:itemId/to-reminder */
export const POST = defineRoute(async ({ request, params, services }) => {
  const { id, itemId } = parseParams(paramsSchema, params);
  const input = parseBody(meetingActionItemReminderSchema, await readJsonBody(request));
  return jsonOk(services.meetingClosure.toReminder(id, itemId, input), 201);
});
