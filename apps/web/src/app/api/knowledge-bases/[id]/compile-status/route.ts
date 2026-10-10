import { idParamSchema } from '@wbfm/shared/schemas';
import { defineRoute } from '@/lib/server/with-api-handler';
import { jsonOk } from '@/lib/server/api-response';
import { parseParams } from '@/lib/server/validation';

export const dynamic = 'force-dynamic';

/**
 * v1.3 M4：编译状态总览。
 * counts 为 DB 各 compile_status 文档计数（真源）；
 * progress 为队列本轮内存进度（running/done/failed/total + 当前文档）。
 */
export const GET = defineRoute(({ params, services }) => {
  const { id } = parseParams(idParamSchema, params);
  services.knowledgeBases.get(id);
  return jsonOk(services.knowledgeCompile.getCompileStatus(id));
});
