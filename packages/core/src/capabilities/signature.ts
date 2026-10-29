import { createPublicKey, verify as verifySignature, type KeyObject } from 'node:crypto';
import { ApiError } from '@wbfm/shared/errors';
import {
  capabilitySignaturePayload,
  type CapabilityManifest,
  type CapabilitySignaturePolicy,
  type CapabilitySignatureStatus,
  type CapabilityTrustedKey,
} from '@wbfm/shared/schemas';

/**
 * v2.12 能力包清单验签（服务端专用：依赖 node:crypto）。
 * canonical 序列化来自 @wbfm/shared/schemas，禁止在此实现第二套。
 */

export interface CapabilitySignatureResult {
  status: CapabilitySignatureStatus;
  /** 命中的信任公钥 id（valid / invalid 时存在） */
  keyId?: string;
  /** 机器可读原因（用于日志与健康详情） */
  reason?: string;
}

function importEd25519PublicKey(pem: string): KeyObject {
  const key = createPublicKey(pem);
  if (key.asymmetricKeyType !== 'ed25519') throw new Error('not an ed25519 public key');
  return key;
}

/** 设置写入前校验：每把公钥都必须能作为 Ed25519 PEM SPKI 导入 */
export function assertTrustedKeysImportable(keys: readonly CapabilityTrustedKey[]): void {
  for (const key of keys) {
    try {
      importEd25519PublicKey(key.publicKey);
    } catch {
      throw ApiError.validation(`信任公钥不可用：${key.id}（需要 Ed25519 PEM SPKI）`);
    }
  }
}

function decodeSignature(raw: string): Buffer | null {
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(raw)) return null;
  const bytes = Buffer.from(raw, 'base64');
  return bytes.length === 64 ? bytes : null;
}

/**
 * 验签五态：
 * - none：无 signature
 * - malformed：base64/长度不合法
 * - untrusted：签名可解析，但 keyId 不在信任库，或无 keyId 且没有公钥匹配
 * - invalid：找到密钥但验签失败
 * - valid：验签通过
 */
export function verifyCapabilitySignature(
  manifest: CapabilityManifest,
  trustedKeys: readonly CapabilityTrustedKey[],
): CapabilitySignatureResult {
  const raw = manifest.signature;
  if (!raw) return { status: 'none' };
  const signature = decodeSignature(raw);
  if (!signature) return { status: 'malformed', reason: 'signature_not_base64_64' };

  const payload = Buffer.from(capabilitySignaturePayload(manifest), 'utf8');
  const matches = (key: CapabilityTrustedKey): boolean => {
    try {
      return verifySignature(null, payload, importEd25519PublicKey(key.publicKey), signature);
    } catch {
      return false;
    }
  };

  if (manifest.signatureKeyId) {
    const key = trustedKeys.find((item) => item.id === manifest.signatureKeyId);
    if (!key) return { status: 'untrusted', reason: 'key_unknown' };
    return matches(key)
      ? { status: 'valid', keyId: key.id }
      : { status: 'invalid', keyId: key.id, reason: 'signature_mismatch' };
  }

  for (const key of trustedKeys) {
    if (matches(key)) return { status: 'valid', keyId: key.id };
  }
  return {
    status: 'untrusted',
    reason: trustedKeys.length > 0 ? 'no_key_matched' : 'no_trusted_keys',
  };
}

/** 按策略裁决：off 跳过；warn 只拒无效签名；require 仅允许 valid */
export function assertCapabilitySignatureAllowed(
  result: CapabilitySignatureResult,
  policy: CapabilitySignaturePolicy,
): void {
  if (policy === 'off') return;
  if (result.status === 'invalid' || result.status === 'malformed') {
    throw ApiError.validation(`能力包签名无效：${result.reason ?? result.status}`);
  }
  if (policy === 'require' && result.status !== 'valid') {
    throw ApiError.validation(`签名策略要求有效签名：${result.status}`);
  }
}
