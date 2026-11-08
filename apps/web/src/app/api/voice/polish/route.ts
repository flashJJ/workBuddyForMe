import { polishVoiceText } from '@wbfm/core/chat';
import { voicePolishRequestSchema } from '@wbfm/shared/schemas';
import { defineRoute } from '@/lib/server/with-api-handler';
import { jsonOk } from '@/lib/server/api-response';
import { parseBody, readJsonBody } from '@/lib/server/validation';

export const dynamic = 'force-dynamic';

/** v2.25：PTT 识别结果润色；无模型/超时按原文返回（200 + polished:false） */
export const POST = defineRoute(async ({ request, services }) => {
  const input = parseBody(voicePolishRequestSchema, await readJsonBody(request));
  const result = await polishVoiceText({
    db: services.db,
    cipher: services.cipher,
    text: input.text,
    signal: request.signal,
  });
  return jsonOk(result);
});
