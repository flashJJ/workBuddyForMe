import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;
const PREFIX = 'wbfm.v1';

interface SealedEnvelope {
  iv: string;
  tag: string;
  data: string;
}

function toBase64(input: Buffer): string {
  return input.toString('base64');
}

function fromBase64(input: string): Buffer {
  return Buffer.from(input, 'base64');
}

/** AES-256-GCM 加密，输出自描述字符串：wbfm.v1.<base64 JSON> */
export function sealWithKey(plaintext: string, key: Buffer): string {
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  const envelope: SealedEnvelope = {
    iv: toBase64(iv),
    tag: toBase64(tag),
    data: toBase64(encrypted),
  };
  return `${PREFIX}.${toBase64(Buffer.from(JSON.stringify(envelope), 'utf8'))}`;
}

/**
 * 解密；密文损坏/篡改/格式错误时返回 null（调用方按「未配置/不可用」降级，不崩溃）。
 */
export function openWithKey(ciphertext: string, key: Buffer): string | null {
  try {
    if (!ciphertext.startsWith(`${PREFIX}.`)) return null;
    const payloadB64 = ciphertext.slice(PREFIX.length + 1);
    const envelope = JSON.parse(fromBase64(payloadB64).toString('utf8')) as SealedEnvelope;
    if (!envelope.iv || !envelope.tag || !envelope.data) return null;
    const decipher = createDecipheriv(ALGORITHM, key, fromBase64(envelope.iv));
    decipher.setAuthTag(fromBase64(envelope.tag));
    const decrypted = Buffer.concat([
      decipher.update(fromBase64(envelope.data)),
      decipher.final(),
    ]);
    return decrypted.toString('utf8');
  } catch {
    return null;
  }
}
