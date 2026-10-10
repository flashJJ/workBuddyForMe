import { compileRequestSchema, idParamSchema } from '@wbfm/shared/schemas';
import { defineRoute } from '@/lib/server/with-api-handler';
import { jsonOk } from '@/lib/server/api-response';
import { parseBody, parseParams, readJsonBody } from '@/lib/server/validation';

export const dynamic = 'force-dynamic';

/**
 * v1.3：触发知识编译（M3 即时顺序执行；M4 将接入单并发队列与进度事件）。
 * body: { scope: 'new'|'all'|'document', documentId?, withLlm? }
 */
export const POST = defineRoute(async ({ request, params, services }) => {
  const { id } = parseParams(idParamSchema, params);
  const body = parseBody(compileRequestSchema, await readJsonBody(request));
  services.knowledgeBases.get(id);
  const result = await services.knowledgeCompile.compileKnowledgeBase(id, {
    scope: body.scope,
    documentId: body.documentId,
    withLlm: body.withLlm,
  });
  return jsonOk(result);
});
