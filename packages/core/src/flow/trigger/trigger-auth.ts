import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

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
