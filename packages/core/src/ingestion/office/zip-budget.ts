import { ApiError } from '@wbfm/shared/errors';

/** OOXML 解压后总体积上限：上传压缩包 ≤10MB，正常文档远低于此值 */
export const OFFICE_MAX_UNCOMPRESSED_BYTES = 256 * 1024 * 1024;

const EOCD_SIG = 0x06054b50;
const CENTRAL_SIG = 0x02014b50;

/**
 * 解析 ZIP 中央目录并校验解压后总体积（防 Office 压缩炸弹）。
 * 结构异常/非 ZIP 不在此报错：交给下游解析器给出原有可读错误。
 */
export function assertZipUncompressedBudget(
  data: Uint8Array,
  maxBytes: number = OFFICE_MAX_UNCOMPRESSED_BYTES,
  label = '文档',
): void {
  if (data.length < 22) return;
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const start = Math.max(0, data.length - 65557);
  let eocd = -1;
  for (let i = data.length - 22; i >= start; i -= 1) {
    if (view.getUint32(i, true) === EOCD_SIG) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) return;

  const count = view.getUint16(eocd + 10, true);
  let p = view.getUint32(eocd + 16, true);
  let total = 0;
  for (let i = 0; i < count; i += 1) {
    if (p + 46 > data.length || view.getUint32(p, true) !== CENTRAL_SIG) return;
    const uncompressed = view.getUint32(p + 24, true);
    // zip64 哨兵：真实体积无法在 32 位内表达，按超限处理
    if (uncompressed === 0xffffffff) {
      throw new ApiError('VALIDATION_ERROR', `${label}解压后体积超过上限，已停止解析`);
    }
    total += uncompressed;
    if (total > maxBytes) {
      throw new ApiError(
        'VALIDATION_ERROR',
        `${label}解压后体积超过上限（${Math.round(maxBytes / 1024 / 1024)}MB），已停止解析`,
      );
    }
    const nameLen = view.getUint16(p + 28, true);
    const extraLen = view.getUint16(p + 30, true);
    const commentLen = view.getUint16(p + 32, true);
    p += 46 + nameLen + extraLen + commentLen;
  }
}
