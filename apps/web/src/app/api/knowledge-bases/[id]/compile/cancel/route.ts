import { idParamSchema } from '@wbfm/shared/schemas';
import { defineRoute } from '@/lib/server/with-api-handler';
import { jsonOk } from '@/lib/server/api-response';
import { parseParams } from '@/lib/server/validation';

export const dynamic = 'force-dynamic';

/**
 * v1.3 M4：取消某库编译——丢弃排队任务并协作式中止当前文档
 * （当前文档会被标记 failed「编译已取消」，可经 scope=new 重试）。
 */
export const POST = defineRoute(({ params, services }) => {
  const { id } = parseParams(idParamSchema, params);
  services.knowledgeBases.get(id);
  return jsonOk(services.knowledgeCompile.cancelCompile(id));
});
