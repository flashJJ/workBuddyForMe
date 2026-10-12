import { idParamSchema } from '@wbfm/shared/schemas';
import { defineRoute } from '@/lib/server/with-api-handler';
import { jsonOk } from '@/lib/server/api-response';
import { parseParams } from '@/lib/server/validation';

export const dynamic = 'force-dynamic';

/**
 * v1.6 M3：读取助手当前情绪/关系状态（已惰性衰减）。
 * 无状态行（从未互动）返回默认状态，不 404；供形象栏表情融合与 M4 情绪面板共用。
 */
export const GET = defineRoute(({ params, services }) => {
  const { id } = parseParams(idParamSchema, params);
  return jsonOk(services.orchestrator.viewEmotion(id));
});
