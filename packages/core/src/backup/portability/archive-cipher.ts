/**
 * v2.33：加密归档容器（WBFM-ENC1）。
 *
 * 布局：magic(9) + 4 字节大端头长度 + 明文 JSON 头 + AES-256-GCM 密文（tag 附尾）。
 * 内层仍是 v8 tar.gz 归档，容器只负责加密与解密；口令用 scrypt 派生，
 * 密码不落盘、不入库、不写日志。
 */
import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'node:crypto';
import { ApiError } from '@wbfm/shared/errors';

const MAGIC = Buffer.from('WBFM-ENC1', 'ascii');
const HEADER_LENGTH_BYTES = 4;
const KDF_N = 2 ** 15;
const KDF_R = 8;
const KDF_P = 1;
const KEY_LENGTH = 32;
const SALT_LENGTH = 16;
const IV_LENGTH = 12;
const TAG_LENGTH = 16;
/** scrypt 需要 maxmem > 128*N*r（约 32MB），留一倍余量 */
const SCRYPT_MAXMEM = 64 * 1024 * 1024;

interface EncryptionHeader {
  version: 1;
  kdf: 'scrypt';
  salt: string;
  N: number;
  r: number;
  p: number;
  iv: string;
}

/** 是否为加密容器（明文中 manifest 可直接读取的 v8 归档返回 false） */
export function isEncryptedArchive(buf: Buffer): boolean {
  return buf.length >= MAGIC.length && buf.subarray(0, MAGIC.length).equals(MAGIC);
}

function deriveKey(password: string, salt: Buffer, header: EncryptionHeader): Buffer {
  const { N, r, p } = header;
  if (!Number.isInteger(N) || !Number.isInteger(r) || !Number.isInteger(p)) {
    throw invalidArchiveError();
  }
  // 限制参数上界，避免恶意头导致内存爆炸
  if (N < 2 ** 14 || N > 2 ** 17 || r < 1 || r > 16 || p < 1 || p > 4) {
    throw invalidArchiveError();
  }
  return scryptSync(password, salt, KEY_LENGTH, { N, r, p, maxmem: SCRYPT_MAXMEM });
}

function invalidArchiveError(): ApiError {
  return new ApiError('BACKUP_PASSWORD_INVALID', '密码错误或归档已损坏');
}

/** 用口令封装明文归档（返回 WBFM-ENC1 容器） */
export function sealArchive(plain: Buffer, password: string): Buffer {
  const salt = randomBytes(SALT_LENGTH);
  const iv = randomBytes(IV_LENGTH);
  const header: EncryptionHeader = {
    version: 1,
    kdf: 'scrypt',
    salt: salt.toString('base64'),
    N: KDF_N,
    r: KDF_R,
    p: KDF_P,
    iv: iv.toString('base64'),
  };
  const headerJson = Buffer.from(JSON.stringify(header), 'utf-8');
  const lengthPrefix = Buffer.alloc(HEADER_LENGTH_BYTES);
  lengthPrefix.writeUInt32BE(headerJson.length, 0);

  const key = deriveKey(password, salt, header);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([cipher.update(plain), cipher.final(), cipher.getAuthTag()]);
  return Buffer.concat([MAGIC, lengthPrefix, headerJson, ciphertext]);
}

/**
 * 解开加密容器。未加密输入原样返回（调用方可始终调用本函数）。
 * @throws BACKUP_PASSWORD_REQUIRED 加密归档但未提供密码
 * @throws BACKUP_PASSWORD_INVALID 密码错误、头损坏或 tag 校验失败
 */
export function openArchive(archive: Buffer, password?: string): Buffer {
  if (!isEncryptedArchive(archive)) return archive;
  if (!password) {
    throw new ApiError('BACKUP_PASSWORD_REQUIRED', '归档已加密，请输入密码');
  }

  const headerStart = MAGIC.length + HEADER_LENGTH_BYTES;
  if (archive.length < headerStart) throw invalidArchiveError();
  const headerLength = archive.readUInt32BE(MAGIC.length);
  const payloadStart = headerStart + headerLength;
  if (headerLength === 0 || payloadStart + TAG_LENGTH > archive.length) {
    throw invalidArchiveError();
  }

  let header: EncryptionHeader;
  try {
    const parsed = JSON.parse(archive.subarray(headerStart, payloadStart).toString('utf-8')) as unknown;
    if (
      typeof parsed !== 'object' ||
      parsed === null ||
      (parsed as EncryptionHeader).version !== 1 ||
      (parsed as EncryptionHeader).kdf !== 'scrypt'
    ) {
      throw invalidArchiveError();
    }
    header = parsed as EncryptionHeader;
  } catch {
    throw invalidArchiveError();
  }

  let salt: Buffer;
  let iv: Buffer;
  try {
    salt = Buffer.from(header.salt, 'base64');
    iv = Buffer.from(header.iv, 'base64');
  } catch {
    throw invalidArchiveError();
  }
  if (salt.length !== SALT_LENGTH || iv.length !== IV_LENGTH) throw invalidArchiveError();

  const payload = archive.subarray(payloadStart);
  const ciphertext = payload.subarray(0, payload.length - TAG_LENGTH);
  const tag = payload.subarray(payload.length - TAG_LENGTH);
  try {
    const key = deriveKey(password, salt, header);
    const decipher = createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  } catch {
    throw invalidArchiveError();
  }
}
