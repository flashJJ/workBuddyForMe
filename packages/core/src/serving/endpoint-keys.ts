import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

/**
 * v0.9 本地 API/MCP 端点密钥：
 * - 明文形态 `wfk_` + 40 hex（共 44 字符），只在创建/重置时展示一次；
 * - 库存 sha256 哈希（不可逆），鉴权时对入参密钥同样哈希后 constant-time 比较；
 * - keyPrefix 存脱敏短头（`wfk_` + 前 8 位），供 UI 识别，不参与鉴权。
 */
export const ENDPOINT_KEY_PREFIX = 'wfk_';
const KEY_RANDOM_BYTES = 20; // 20 bytes → 40 hex
const KEY_PREFIX_KEEP = ENDPOINT_KEY_PREFIX.length + 8; // wfk_ 后保留 8 位用于识别

export interface GeneratedEndpointKey {
  /** 完整明文（仅本次返回） */
  key: string;
  /** sha256 哈希（入库） */
  keyHash: string;
  /** 脱敏短头（入库展示） */
  keyPrefix: string;
}

export function generateEndpointKey(): GeneratedEndpointKey {
  const key = `${ENDPOINT_KEY_PREFIX}${randomBytes(KEY_RANDOM_BYTES).toString('hex')}`;
  return { key, keyHash: hashEndpointKey(key), keyPrefix: endpointKeyPreview(key) };
}

export function hashEndpointKey(key: string): string {
  return createHash('sha256').update(key, 'utf8').digest('hex');
}

/** UI 展示短头：wfk_abcd1234（其余省略） */
export function endpointKeyPreview(key: string): string {
  return key.slice(0, KEY_PREFIX_KEEP);
}

/**
 * constant-time 密钥校验：等长（sha256 hex 固定 64 位）时用 timingSafeEqual，
 * 长度异常直接 false（不抛异常，避免鉴权路径被畸形输入打断）。
 */
export function verifyEndpointKey(key: string, expectedHash: string): boolean {
  if (typeof key !== 'string' || key.length === 0) return false;
  const actual = Buffer.from(hashEndpointKey(key), 'hex');
  const expected = Buffer.from(expectedHash, 'hex');
  if (actual.length !== expected.length) return false;
  return timingSafeEqual(actual, expected);
}
