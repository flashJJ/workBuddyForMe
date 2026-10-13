import { idParamSchema } from '@wbfm/shared/schemas';
import { z } from 'zod';
import { defineRoute } from '@/lib/server/with-api-handler';
import { jsonOk } from '@/lib/server/api-response';
import { parseBody, parseParams, readJsonBody } from '@/lib/server/validation';

export const dynamic = 'force-dynamic';

/** v1.7 M5 剧情情绪联动入参：只接受积极/哄好两类事件类型 */
const eventEmotionBodySchema = z.object({
  type: z.enum(['praise', 'comfort']),
  description: z.string().trim().min(1).max(120).optional(),
});

/**
 * 剧情演出完整播完（played）后施加情绪增量；source 固定为 'event'。
 * 永不阻断主流程：客户端只做 best-effort 调用。
 */
export const POST = defineRoute(async ({ params, request, services }) => {
  const { id } = parseParams(idParamSchema, params);
  const body = parseBody(eventEmotionBodySchema, await readJsonBody(request));
  return jsonOk(services.orchestrator.recordEventEmotion(id, body));
});
