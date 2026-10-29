import { generateKeyPairSync } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { settingsUpdateSchema } from '@wbfm/shared/schemas';
import { createDatabase, createSettingsRepository, type DatabaseInstance } from '@wbfm/database';
import { createWebCipher, type SecretCipher } from '../secrets/cipher';
import {
  DEFAULT_SETTINGS,
  createSettingsService,
  resolveCapabilitySignaturePolicy,
  resolveCapabilityTrustedKeys,
} from './settings-service';

function ed25519PublicKeyPem(): string {
  return generateKeyPairSync('ed25519')
    .publicKey.export({ type: 'spki', format: 'pem' })
    .toString();
}

const KEY = {
  id: 'local-dev',
  label: '本地开发',
  publicKey: '',
  createdAt: '2026-10-30T00:00:00.000Z',
};

describe('v2.12 能力包签名设置', () => {
  let db: DatabaseInstance;
  let cipher: SecretCipher;

  beforeEach(() => {
    db = createDatabase(':memory:');
    cipher = createWebCipher();
  });

  afterEach(() => {
    db.close();
  });

  it('默认 warn、信任库为空', () => {
    expect(DEFAULT_SETTINGS.capabilitySignaturePolicy).toBe('warn');
    expect(DEFAULT_SETTINGS.capabilityTrustedKeys).toEqual([]);
  });

  it('策略与信任库可持久化；非法 PEM 拒绝写入', () => {
    const pem = ed25519PublicKeyPem();
    const settings = createSettingsService({ db, cipher });
    const updated = settings.update({
      capabilitySignaturePolicy: 'require',
      capabilityTrustedKeys: [{ ...KEY, publicKey: pem }],
    });
    expect(updated.capabilitySignaturePolicy).toBe('require');
    expect(updated.capabilityTrustedKeys).toHaveLength(1);
    expect(settings.get().capabilityTrustedKeys?.[0]?.publicKey).toBe(pem.trim());

    expect(() =>
      settings.update({ capabilityTrustedKeys: [{ ...KEY, id: 'bad', publicKey: 'not-a-pem' }] }),
    ).toThrow(/信任公钥不可用/);
  });

  it('手改 settings_kv：非法策略回落 warn，坏键与重复 id 被丢弃', () => {
    createSettingsRepository(db).setJson('app-settings', {
      capabilitySignaturePolicy: 'nonsense',
      capabilityTrustedKeys: [
        { ...KEY, label: '', publicKey: 'x' },
        { ...KEY, id: 'dup', publicKey: 'y' },
        { ...KEY, id: 'dup', publicKey: 'z' },
      ],
    });
    const settings = createSettingsService({ db, cipher });
    expect(settings.get().capabilitySignaturePolicy).toBe('warn');
    expect(settings.get().capabilityTrustedKeys?.map((key) => key.id)).toEqual(['dup']);
  });

  it('schema 拒绝重复 keyId；钳制函数保留首个并截断到 20 条', () => {
    const duplicate = settingsUpdateSchema.safeParse({
      capabilityTrustedKeys: [
        { ...KEY, publicKey: 'pem-a' },
        { ...KEY, publicKey: 'pem-b' },
      ],
    });
    expect(duplicate.success).toBe(false);

    const many = Array.from({ length: 25 }, (_, index) => ({
      ...KEY,
      id: `key-${index}`,
      publicKey: 'pem-placeholder',
    }));
    expect(resolveCapabilityTrustedKeys(many)).toHaveLength(20);
    expect(resolveCapabilitySignaturePolicy('off')).toBe('off');
  });
});
