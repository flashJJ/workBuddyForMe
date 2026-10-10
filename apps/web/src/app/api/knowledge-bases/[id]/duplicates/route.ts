import { idParamSchema } from '@wbfm/shared/schemas';
import { defineRoute } from '@/lib/server/with-api-handler';
import { jsonOk } from '@/lib/server/api-response';
import { parseParams } from '@/lib/server/validation';

export const dynamic = 'force-dynamic';

/**
 * v1.3 M3：疑似重复文档建议（只读：文件名归一化 + 跨文档向量近邻聚合）。
 * 仅返回建议与跳转所需信息，删除仍由用户在界面手动完成。
 */
export const GET = defineRoute(({ params, services }) => {
  const { id } = parseParams(idParamSchema, params);
  services.knowledgeBases.get(id);
  return jsonOk({ duplicates: services.knowledgeGovernance.listDuplicateSuggestions(id) });
});
