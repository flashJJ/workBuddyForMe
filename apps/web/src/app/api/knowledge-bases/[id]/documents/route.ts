import { idParamSchema } from '@wbfm/shared';
import { defineRoute } from '@/lib/server/with-api-handler';
import { jsonOk } from '@/lib/server/api-response';
import { parseParams } from '@/lib/server/validation';
import { readUploadPart } from '@/lib/server/multipart';

export const dynamic = 'force-dynamic';

export const GET = defineRoute(({ params, services }) => {
  const { id } = parseParams(idParamSchema, params);
  return jsonOk(services.documents.listByKnowledgeBase(id));
});

/**
 * 文档上传：登记元数据（pending）后后台执行摄入流水线，
 * 客户端通过 GET /api/documents/[id] 轮询 processing→indexed/failed。
 */
export const POST = defineRoute(async ({ request, params, services }) => {
  const { id } = parseParams(idParamSchema, params);
  const part = await readUploadPart(request);
  const document = services.documents.upload(id, part);

  void services.documents.ingest(document.id, part.buffer).catch((error) => {
    console.error(`[ingest] 文档 ${document.id} 摄入异常：`, error);
  });

  return jsonOk(document, 201);
});
