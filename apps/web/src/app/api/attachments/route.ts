import { MAX_IMAGE_BYTES } from '@wbfm/shared';
import { defineRoute } from '@/lib/server/with-api-handler';
import { jsonOk } from '@/lib/server/api-response';
import { readUploadPart } from '@/lib/server/multipart';

export const dynamic = 'force-dynamic';

/**
 * 图片附件上传：multipart file 字段，限 png/jpeg/webp、10MB。
 * 浏览器已先行压缩，服务端再次校验 mime 与大小并落盘去重，返回附件元数据（含 id）。
 */
export const POST = defineRoute(async ({ request, services }) => {
  const part = await readUploadPart(request, MAX_IMAGE_BYTES);
  const attachment = services.attachments.save({
    filename: part.filename,
    mimeType: part.mimeType,
    buffer: part.buffer,
  });
  return jsonOk(attachment, 201);
});
