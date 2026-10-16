import {
  PACK_BLACKLIST_EXT,
  PACK_FORBIDDEN_PREFIXES,
} from '@wbfm/shared/schemas';

/**
 * ZIP 中央目录只读解析（不做解压）：供 .wbfm-pack 容器层安全校验。
 * fflate 同步 API 不暴露 external attributes，符号链接需自行解析中央目录。
 */

export interface ZipCentralEntry {
  name: string;
  /** 压缩方式：8=DEFLATE，0=STORED */
  method: number;
  flags: number;
  compressedSize: number;
  uncompressedSize: number;
  /** 中央目录 external file attributes（高 16 位为 Unix mode，hostOs=3 时有效） */
  externalAttr: number;
  /** 制作系统（高字节；3=Unix） */
  hostOs: number;
  isDirectory: boolean;
}

const EOCD_SIG = 0x06054b50;
const CENTRAL_SIG = 0x02014b50;

function dv(buf: Uint8Array): DataView {
  return new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
}

/** 定位中央目录（扫描 EOCD；不含 zip64，命中 zip64 直接判非法） */
function locateCentral(view: DataView, buf: Uint8Array): { offset: number; count: number } {
  // EOCD 长 22 字节起，注释最长 64KB；从尾部回扫
  const maxComment = 65557;
  const start = Math.max(0, buf.length - maxComment);
  for (let i = buf.length - 22; i >= start; i--) {
    if (view.getUint32(i, true) === EOCD_SIG) {
      const count = view.getUint16(i + 10, true);
      const size = view.getUint32(i + 12, true);
      const offset = view.getUint32(i + 16, true);
      // zip64 哨兵：本格式不支持 zip64（20MB 上限无需）
      if (count === 0xffff || offset === 0xffffffff || size === 0xffffffff) {
        throw new ZipSafetyError('不支持 ZIP64 格式的包');
      }
      return { offset, count };
    }
  }
  throw new ZipSafetyError('缺少 ZIP 中央目录（可能不是合法 zip）');
}

export class ZipSafetyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ZipSafetyError';
  }
}

/**
 * 解析并做容器层安全校验：
 * 加密条目拒绝 / 非 DEFLATE 文件拒绝 / zip64 拒绝 / 符号链接拒绝 /
 * 危险路径拒绝 / 黑名单扩展名与禁含前缀拒绝。
 * 显式目录条目被剔除（不参与后续校验）。
 */
export function readCentralDirectorySafely(buf: Uint8Array): ZipCentralEntry[] {
  if (buf.length < 22 || buf[0] !== 0x50 || buf[1] !== 0x4b) {
    throw new ZipSafetyError('不是合法的 ZIP 文件（缺少 PK 文件头）');
  }
  const view = dv(buf);
  const { offset, count } = locateCentral(view, buf);
  const entries: ZipCentralEntry[] = [];
  let p = offset;
  const seen = new Set<string>();

  for (let i = 0; i < count; i++) {
    if (p + 46 > buf.length || view.getUint32(p, true) !== CENTRAL_SIG) {
      throw new ZipSafetyError('ZIP 中央目录损坏');
    }
    const hostOs = buf[p + 5];
    const flags = view.getUint16(p + 8, true);
    const method = view.getUint16(p + 10, true);
    const compressedSize = view.getUint32(p + 20, true);
    const uncompressedSize = view.getUint32(p + 24, true);
    const nameLen = view.getUint16(p + 28, true);
    const extraLen = view.getUint16(p + 30, true);
    const commentLen = view.getUint16(p + 32, true);
    const externalAttr = view.getUint32(p + 38, true);
    const nameBytes = buf.subarray(p + 46, p + 46 + nameLen);
    const name = new TextDecoder('utf-8').decode(nameBytes);
    p += 46 + nameLen + extraLen + commentLen;

    const isDirectory = name.endsWith('/');
    if (isDirectory) continue;
    assertSafeEntryName(name);

    const lower = name.toLowerCase();
    for (const prefix of PACK_FORBIDDEN_PREFIXES) {
      if (lower.startsWith(prefix)) {
        throw new ZipSafetyError(`包含禁含路径：${name}（${prefix}** 不允许进包）`);
      }
    }
    for (const ext of PACK_BLACKLIST_EXT) {
      if (lower.endsWith(ext)) {
        throw new ZipSafetyError(`包含黑名单文件类型：${name}（${ext}）`);
      }
    }
    if (/\.(zip|wbfm-pack|tar|gz|7z|rar)$/i.test(name)) {
      throw new ZipSafetyError(`不允许嵌套压缩包：${name}`);
    }
    if (flags & 0x1) throw new ZipSafetyError(`加密 ZIP 条目不被支持：${name}`);
    if (compressedSize === 0xffffffff || uncompressedSize === 0xffffffff) {
      throw new ZipSafetyError(`不支持 ZIP64 条目：${name}`);
    }
    // Unix 符号链接：S_IFLNK = 0xA000（mode 位 0120000）
    if (hostOs === 3 && ((externalAttr >>> 16) & 0o170000) === 0o120000) {
      throw new ZipSafetyError(`符号链接条目被拒绝：${name}`);
    }
    if (method !== 8) {
      throw new ZipSafetyError(`条目必须使用 DEFLATE 压缩：${name}`);
    }
    if (seen.has(lower)) throw new ZipSafetyError(`包内路径重复：${name}`);
    seen.add(lower);
    entries.push({
      name,
      method,
      flags,
      compressedSize,
      uncompressedSize,
      externalAttr,
      hostOs: hostOs ?? 0,
      isDirectory,
    });
  }
  if (entries.length === 0) throw new ZipSafetyError('空包：没有任何文件条目');
  return entries;
}

/** 04 §2：禁绝对路径/盘符/.. /反斜杠/控制字符/空字节/冒号 */
function assertSafeEntryName(name: string): void {
  if (name.length === 0) throw new ZipSafetyError('存在空文件名条目');
  if (name.includes('\\')) throw new ZipSafetyError(`路径不允许反斜杠：${name}`);
  if (name.startsWith('/')) throw new ZipSafetyError(`不允许绝对路径：${name}`);
  if (/^[a-z]:/i.test(name)) throw new ZipSafetyError(`不允许盘符路径：${name}`);
  if (name.includes(':')) throw new ZipSafetyError(`路径不允许冒号：${name}`);
  if (name.split('/').includes('..')) throw new ZipSafetyError(`路径穿越被拒绝：${name}`);
  // eslint-disable-next-line no-control-regex
  if (/[\x00-\x1f\x7f]/.test(name)) throw new ZipSafetyError(`路径含控制字符：${name}`);
}
