import { ApiError } from '@wbfm/shared/errors';
import { MAX_IMAGE_BYTES } from '@wbfm/shared/constants';

export interface UploadPart {
  filename: string;
  mimeType: string;
  buffer: Uint8Array;
}

/** multipart 解析结果：file 部件 + 其余文本字段（值原样返回，trim/校验由调用方负责） */
export interface UploadFormResult {
  file: UploadPart;
  fields: Record<string, string>;
}

const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;

/**
 * 解析 multipart/form-data 中的 file 字段；maxBytes 按场景区分（文档 20MB / 图片 10MB）
 */
export async function readUploadPart(
  request: Request,
  maxBytes: number = MAX_UPLOAD_BYTES,
): Promise<UploadPart> {
  return (await readUploadForm(request, maxBytes)).file;
}

/**
 * 解析 multipart/form-data 的 file 部件（字段名必须为 file）**与其余文本字段**。
 *
 * 文本字段用于上传时的可选标注（v2.2：VRMA 的动作段 / 心情档位 / 动作条目键 / 关系门槛）。
 * 缺失即不返回该键，交由下游按缺省处理。
 */
export async function readUploadForm(
  request: Request,
  maxBytes: number = MAX_UPLOAD_BYTES,
): Promise<UploadFormResult> {
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
  const fields: Record<string, string> = {};
  for (const [key, value] of form.entries()) {
    if (key === 'file') continue;
    if (typeof value === 'string') fields[key] = value;
  }
  return {
    file: {
      filename: file.name,
      mimeType: file.type,
      buffer: new Uint8Array(await file.arrayBuffer()),
    },
    fields,
  };
}
