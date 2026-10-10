import { idParamSchema } from '@wbfm/shared/schemas';
import { defineRoute } from '@/lib/server/with-api-handler';
import { jsonOk } from '@/lib/server/api-response';
import { parseParams } from '@/lib/server/validation';

export const dynamic = 'force-dynamic';

/**
 * v1.3 M3：知识冲突待裁决列表（只读建议，不自动删改）。
 * 未编译知识库返回空数组。
 */
export const GET = defineRoute(({ params, services }) => {
  const { id } = parseParams(idParamSchema, params);
  // 先校验知识库存在（不存在抛 404），再计算冲突
  services.knowledgeBases.get(id);
  return jsonOk({ conflicts: services.knowledgeGovernance.listConflicts(id) });
});
