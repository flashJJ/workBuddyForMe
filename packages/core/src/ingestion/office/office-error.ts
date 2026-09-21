import { ApiError } from '@wbfm/shared';

/** 老式二进制 Office 扩展名（OOXML 之前格式，v0.3 不支持） */
export const LEGACY_OFFICE_EXTENSIONS = ['.doc', '.xls', '.ppt'];

/** 上传老式 .doc/.xls/.ppt 时给出另存指引，而非笼统的“不支持” */
export function rejectLegacyOffice(ext: string): never {
  throw ApiError.validation(
    `不支持老式二进制 ${ext} 格式，请用 Office/WPS 另存为新版 ${ext}x 后再上传`,
  );
}

/** 解析期异常归一：加密/损坏包错误信息统一可读，且不走 500 */
export function toOfficeReadError(format: string, error: unknown): ApiError {
  const reason = error instanceof Error ? error.message : String(error);
  return ApiError.validation(
    `${format} 文档解析失败：文件可能已加密或已损坏（${reason.slice(0, 120)}）`,
  );
}
