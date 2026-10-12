import { idParamSchema } from '@wbfm/shared/schemas';
import { z } from 'zod';
import { defineRoute } from '@/lib/server/with-api-handler';
import { jsonOk } from '@/lib/server/api-response';
import { parseParams, parseSearch } from '@/lib/server/validation';

export const dynamic = 'force-dynamic';

const emotionQuerySchema = z.object({
  /** 附带近期事件流水条数（默认 0=只要状态快照；面板传 10/20） */
  events: z.coerce.number().int().min(0).max(50).optional(),
});

/**
 * v1.6：读取助手当前情绪/关系状态（已惰性衰减）。
 * 无状态行（从未互动）返回默认状态，不 404。
 * ?events=N 时返回 { state, events }（设置面板用），否则直接返回状态（形象栏用）。
 */
export const GET = defineRoute(({ params, request, services }) => {
  const { id } = parseParams(idParamSchema, params);
  const query = parseSearch(emotionQuerySchema, new URL(request.url));
  if (typeof query.events === 'number' && query.events > 0) {
    return jsonOk(services.orchestrator.viewEmotionDetail(id, query.events));
  }
  return jsonOk(services.orchestrator.viewEmotion(id));
});

/** 重置：清除该助手的情绪/关系状态与事件流水（重新认识） */
export const DELETE = defineRoute(({ params, services }) => {
  const { id } = parseParams(idParamSchema, params);
  return jsonOk(services.orchestrator.resetEmotion(id));
});
