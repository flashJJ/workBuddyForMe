import { STAGE_BACKGROUND_MAX_BYTES } from '@wbfm/shared/schemas';
import { defineRoute } from '@/lib/server/with-api-handler';
import { jsonOk } from '@/lib/server/api-response';
import { readUploadPart } from '@/lib/server/multipart';

export const dynamic = 'force-dynamic';

/**
 * 舞台背景上传：multipart file，png/jpeg/webp、≤20MB。
 * 文件复制进数据目录 stage-backgrounds/（服务端生成文件名），仅返回 fileRef；
 * fileRef 写进场景 payload 后图片才被引用（未被引用的文件 M1 不做 GC，避免删图竞态）。
 */
export const POST = defineRoute(async ({ request, services }) => {
  const part = await readUploadPart(request, STAGE_BACKGROUND_MAX_BYTES);
  const staged = services.stageScenes.saveBackground({
    mimeType: part.mimeType,
    buffer: part.buffer,
  });
  return jsonOk(staged, 201);
});
