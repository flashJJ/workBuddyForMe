import { generateKeyPairSync, sign } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  capabilityManifestSchema,
  capabilitySignaturePayload,
  type CapabilityManifest,
  type CapabilityTrustedKey,
} from '@wbfm/shared/schemas';
import {
  assertCapabilitySignatureAllowed,
  assertTrustedKeysImportable,
  verifyCapabilitySignature,
} from './signature';

function keypair() {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  return {
    privateKey,
    publicKeyPem: publicKey.export({ type: 'spki', format: 'pem' }).toString(),
  };
}

function buildManifest(extra: Record<string, unknown> = {}): CapabilityManifest {
  return capabilityManifestSchema.parse({
    id: 'com.example.signed',
    version: '1.0.0',
    kind: 'skill',
    name: '签名示例',
    description: '验签测试',
    permissions: ['skill:install'],
    entry: 'payload/skill.json',
    dependencies: [],
    checksums: { 'payload/skill.json': 'a'.repeat(64) },
    ...extra,
  });
}

function signManifest(manifest: CapabilityManifest, privateKey: ReturnType<typeof keypair>['privateKey']) {
  const signature = sign(null, Buffer.from(capabilitySignaturePayload(manifest)), privateKey).toString(
    'base64',
  );
  return { ...manifest, signature };
}

const trustedKey = (pem: string): CapabilityTrustedKey => ({
  id: 'local-dev',
  label: '本地开发',
  publicKey: pem,
  createdAt: '2026-10-30T00:00:00.000Z',
});

describe('v2.12 能力包验签', () => {
  it('有效签名：命中 keyId 返回 valid', () => {
    const { privateKey, publicKeyPem } = keypair();
    const signed = signManifest(buildManifest({ signatureKeyId: 'local-dev' }), privateKey);
    expect(verifyCapabilitySignature(signed, [trustedKey(publicKeyPem)])).toMatchObject({
      status: 'valid',
      keyId: 'local-dev',
    });
  });

  it('缺省 keyId 时遍历信任库；换一把公钥则 invalid/untrusted', () => {
    const a = keypair();
    const b = keypair();
    const signed = signManifest(buildManifest(), a.privateKey);
    expect(verifyCapabilitySignature(signed, [trustedKey(a.publicKeyPem)]).status).toBe('valid');
    expect(
      verifyCapabilitySignature(signed, [
        { ...trustedKey(b.publicKeyPem), id: 'other-key' },
      ]).status,
    ).toBe('untrusted');
    expect(
      verifyCapabilitySignature(signed, [{ ...trustedKey(b.publicKeyPem), id: 'local-dev' }]).status,
    ).toBe('untrusted');
  });

  it('缺签名、坏 base64、篡改清单：none / malformed / invalid', () => {
    const { privateKey, publicKeyPem } = keypair();
    expect(verifyCapabilitySignature(buildManifest(), []).status).toBe('none');
    expect(
      verifyCapabilitySignature({ ...buildManifest(), signature: 'not-base64' }, []).status,
    ).toBe('malformed');
    const signed = signManifest(buildManifest({ signatureKeyId: 'local-dev' }), privateKey);
    const tampered = { ...signed, name: '被篡改的名字' };
    expect(verifyCapabilitySignature(tampered, [trustedKey(publicKeyPem)])).toMatchObject({
      status: 'invalid',
    });
  });

  it('keyId 不在信任库：untrusted', () => {
    const { privateKey, publicKeyPem } = keypair();
    const signed = signManifest(buildManifest({ signatureKeyId: 'missing' }), privateKey);
    expect(verifyCapabilitySignature(signed, [trustedKey(publicKeyPem)])).toMatchObject({
      status: 'untrusted',
      reason: 'key_unknown',
    });
  });

  it('信任公钥必须是 Ed25519 PEM', () => {
    const { publicKeyPem } = keypair();
    expect(() => assertTrustedKeysImportable([trustedKey(publicKeyPem)])).not.toThrow();
    const rsa = generateKeyPairSync('rsa', { modulusLength: 2048 });
    const rsaPem = rsa.publicKey.export({ type: 'spki', format: 'pem' }).toString();
    expect(() => assertTrustedKeysImportable([trustedKey(rsaPem)])).toThrow(/信任公钥不可用/);
  });
});

describe('v2.12 签名策略裁决', () => {
  it('off 跳过；warn 只拒 invalid/malformed；require 仅允许 valid', () => {
    const { privateKey, publicKeyPem } = keypair();
    const signed = signManifest(buildManifest({ signatureKeyId: 'local-dev' }), privateKey);
    const valid = verifyCapabilitySignature(signed, [trustedKey(publicKeyPem)]);
    const none = verifyCapabilitySignature(buildManifest(), []);
    const invalid = verifyCapabilitySignature(
      { ...signed, name: '变更' },
      [trustedKey(publicKeyPem)],
    );

    expect(() => assertCapabilitySignatureAllowed(invalid, 'off')).not.toThrow();
    expect(() => assertCapabilitySignatureAllowed(invalid, 'warn')).toThrow(/签名无效/);
    expect(() => assertCapabilitySignatureAllowed(none, 'warn')).not.toThrow();
    expect(() => assertCapabilitySignatureAllowed(none, 'require')).toThrow(/有效签名/);
    expect(() => assertCapabilitySignatureAllowed(valid, 'require')).not.toThrow();
  });
});
