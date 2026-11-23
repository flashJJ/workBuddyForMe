import { z } from 'zod';
import { ApiError } from '@wbfm/shared/errors';
import { defineRoute } from '@/lib/server/with-api-handler';
import { jsonOk } from '@/lib/server/api-response';
import { parseParams } from '@/lib/server/validation';

export const dynamic = 'force-dynamic';

const paramsSchema = z.object({ id: z.string().min(1), triggerId: z.string().min(1) });

/**
 * POST /api/flows/:id/triggers/:triggerId/rotate：轮换 Webhook Secret。
 * 旧 Secret 即时失效；新明文只在本响应返回一次。
 */
export const POST = defineRoute(({ params, services }) => {
  const { id, triggerId } = parseParams(paramsSchema, params);
  try {
    return jsonOk(services.flowTriggers.service.rotateSecret(id, triggerId));
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw ApiError.validation(error instanceof Error ? error.message : 'Secret 轮换失败');
  }
});
