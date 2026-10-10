import { compileRequestSchema, idParamSchema } from '@wbfm/shared/schemas';
import { defineRoute } from '@/lib/server/with-api-handler';
import { jsonOk } from '@/lib/server/api-response';
import { parseBody, parseParams, readJsonBody } from '@/lib/server/validation';

export const dynamic = 'force-dynamic';

/**
 * v1.3 M4：触发知识编译（入队即返回，后台单并发队列执行）。
 * body: { scope: 'new'|'all'|'document', documentId?, withLlm? }
 * 返回 { queued, skipped }：skipped=已在队列/执行中的去重数。
 */
export const POST = defineRoute(async ({ request, params, services }) => {
  const { id } = parseParams(idParamSchema, params);
  const body = parseBody(compileRequestSchema, await readJsonBody(request));
  services.knowledgeBases.get(id);
  const result = services.knowledgeCompile.compileKnowledgeBase(id, {
    scope: body.scope,
    documentId: body.documentId,
    withLlm: body.withLlm,
  });
  return jsonOk(result);
});
