import { clipRequestSchema, idParamSchema } from '@wbfm/shared';
import { defineRoute } from '@/lib/server/with-api-handler';
import { jsonOk } from '@/lib/server/api-response';
import { parseBody, parseParams, readJsonBody } from '@/lib/server/validation';

export const dynamic = 'force-dynamic';

/**
 * v0.3 网页剪藏：抓取+抽取成功后登记 pending 文档并后台摄入，
 * 客户端复用文档 processing→indexed/failed 轮询；抓取/SSRF/抽取错误同步返回。
 */
export const POST = defineRoute(async ({ request, params, services }) => {
  const { id } = parseParams(idParamSchema, params);
  const body = parseBody(clipRequestSchema, await readJsonBody(request));
  const { document, buffer } = await services.documents.clip(id, body.url);

  void services.documents.ingest(document.id, buffer).catch((error) => {
    console.error(`[clip] 网页文档 ${document.id} 摄入异常：`, error);
  });

  return jsonOk(document, 201);
});
