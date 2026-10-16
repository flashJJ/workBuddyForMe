import { idParamSchema } from '@wbfm/shared/schemas';
import { defineRoute } from '@/lib/server/with-api-handler';
import { jsonOk } from '@/lib/server/api-response';
import { parseParams } from '@/lib/server/validation';

export const dynamic = 'force-dynamic';

/**
 * v2.0 M2 助手共同里程碑：
 * GET 先懒评估当前助手（协作次数当天变化可实时达成；日类自然日跨天即达成），
 * 再返回全部达成记录（正序）。客户端据此驱动纪念演出与面板展示。
 */
export const GET = defineRoute(({ params, services }) => {
  const { id } = parseParams(idParamSchema, params);
  services.relationshipMilestones.evaluateAssistant(id);
  return jsonOk(services.relationshipMilestones.list(id));
});
