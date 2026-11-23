import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

const SECRET_PREFIX = 'wft_';

/** v4.25：生成 Webhook 触发器 Secret（仅创建响应返回一次） */
export function generateWebhookSecret(): string {
  return `${SECRET_PREFIX}${randomBytes(32).toString('base64url')}`;
}

/** 只存哈希，库内不可逆 */
export function hashTriggerSecret(secret: string): string {
  return createHash('sha256').update(secret).digest('hex');
}

/** 常量时间比较；长度不一致直接失败 */
export function verifyTriggerSecret(secret: string, storedHash: string): boolean {
  const candidate = Buffer.from(hashTriggerSecret(secret), 'hex');
  const expected = Buffer.from(storedHash, 'hex');
  return candidate.length === expected.length && timingSafeEqual(candidate, expected);
}

/** v5.0：HMAC-SHA256(`${timestamp}.${rawBody}`) 小写 hex */
export function signWebhookPayload(secret: string, timestamp: string, rawBody: string): string {
  return createHmac('sha256', secret).update(`${timestamp}.${rawBody}`).digest('hex');
}

export function verifyWebhookSignature(params: {
  secret: string;
  timestamp: string | null;
  signature: string | null;
  rawBody: string;
  nowMs?: number;
  windowSec?: number;
}): boolean {
  const { secret, timestamp, signature, rawBody } = params;
  if (!timestamp || !signature) return false;
  if (!/^\d{1,12}$/.test(timestamp)) return false;
  const tsMs = Number(timestamp) * 1000;
  const nowMs = params.nowMs ?? Date.now();
  const windowMs = (params.windowSec ?? 300) * 1000;
  if (Math.abs(nowMs - tsMs) > windowMs) return false;
  if (!/^[0-9a-f]{64}$/i.test(signature)) return false;
  const expected = Buffer.from(signWebhookPayload(secret, timestamp, rawBody), 'hex');
  const candidate = Buffer.from(signature.toLowerCase(), 'hex');
  return candidate.length === expected.length && timingSafeEqual(candidate, expected);
}
