import { idParamSchema, messageFeedbackSchema } from '@wbfm/shared';
import { z } from 'zod';
import { defineRoute } from '@/lib/server/with-api-handler';
import { jsonOk } from '@/lib/server/api-response';
import { parseBody, parseParams, readJsonBody } from '@/lib/server/validation';

export const dynamic = 'force-dynamic';

const paramsSchema = z.object({
  id: idParamSchema.shape.id,
  messageId: idParamSchema.shape.id,
});

/** v0.5 P1-2：消息级 👍/👎（feedback=null 取消） */
export const PATCH = defineRoute(async ({ request, params, services }) => {
  const { id, messageId } = parseParams(paramsSchema, params);
  const body = parseBody(messageFeedbackSchema, await readJsonBody(request));
  const message = services.conversations.setMessageFeedback(id, messageId, body.feedback);
  return jsonOk(message);
});
