import { ApiError, MAX_IMAGE_BYTES } from '@wbfm/shared';

export interface UploadPart {
  filename: string;
  mimeType: string;
  buffer: Uint8Array;
}

const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;

/** 解析 multipart/form-data 中的 file 字段；maxBytes 按场景区分（文档 20MB / 图片 10MB） */
export async function readUploadPart(
  request: Request,
  maxBytes: number = MAX_UPLOAD_BYTES,
): Promise<UploadPart> {
  const form = await request.formData();
  const file = form.get('file');
  if (!(file instanceof File) || file.size === 0) {
    throw ApiError.validation('缺少上传文件（字段名必须为 file，且不能为空）');
  }
  if (file.size > maxBytes) {
    throw ApiError.validation(
      maxBytes === MAX_IMAGE_BYTES ? '图片超过 10MB 上限' : '文件超过 20MB 上限',
    );
  }
  return {
    filename: file.name,
    mimeType: file.type,
    buffer: new Uint8Array(await file.arrayBuffer()),
  };
}
