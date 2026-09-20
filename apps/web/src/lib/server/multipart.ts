import { ApiError } from '@wbfm/shared';

export interface UploadPart {
  filename: string;
  buffer: Uint8Array;
}

const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;

/** 解析 multipart/form-data 中的 file 字段 */
export async function readUploadPart(request: Request): Promise<UploadPart> {
  const form = await request.formData();
  const file = form.get('file');
  if (!(file instanceof File) || file.size === 0) {
    throw ApiError.validation('缺少上传文件（字段名必须为 file，且不能为空）');
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    throw ApiError.validation('文件超过 20MB 上限');
  }
  return {
    filename: file.name,
    buffer: new Uint8Array(await file.arrayBuffer()),
  };
}
