import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  createDatabase,
  createProviderRepository,
  type DatabaseInstance,
} from '@wbfm/database';
import { resetDataRootForTest, setDataRootForTest } from '@wbfm/config';
import { createWebCipher, type SecretCipher } from './cipher';
import { createSecretRotationService } from './rotate';

describe('v2.15 Provider 凭证轮换', () => {
  let db: DatabaseInstance;

  beforeEach(() => {
    setDataRootForTest(mkdtempSync(join(tmpdir(), 'wbfm-rotate-')));
    db = createDatabase();
  });

  afterEach(() => {
    db.close();
    resetDataRootForTest();
  });

  function seed(cipher: SecretCipher, count: number): string[] {
    const repo = createProviderRepository(db);
    const ids: string[] = [];
    for (let index = 0; index < count; index += 1) {
      ids.push(
        repo.create({
          name: `provider-${index}`,
          protocol: 'openai-compatible',
          baseUrl: 'https://example.test',
          apiKeyCipher: cipher.encrypt(`sk-${index}`),
          enabled: true,
          sortOrder: index,
        }).id,
      );
    }
    return ids;
  }

  it('Web：轮换主密钥并重封装可解密行；跳过坏密文，旧密文仍可解', () => {
    const cipher = createWebCipher();
    const ids = seed(cipher, 2);
    const repo = createProviderRepository(db);
    const broken = repo.create({
      name: 'provider-broken',
      protocol: 'openai-compatible',
      baseUrl: 'https://example.test',
      apiKeyCipher: 'wbfm.v1.broken',
      enabled: true,
      sortOrder: 2,
    });
    const before = repo.getRow(ids[0]!)!.api_key_cipher;

    const result = createSecretRotationService({ db, cipher }).rotate();
    expect(result).toMatchObject({
      mode: 'web',
      total: 3,
      rotated: 2,
      skipped: 1,
      failed: 0,
      legacyKeySynced: true,
    });
    expect(result.skippedProviders).toEqual([broken.id]);
    expect(result.keyId).toBeTruthy();

    // 新 cipher 模拟重启：keyring 已持久化，可解密重封装后的行
    const reloaded = createWebCipher();
    for (const id of ids) {
      const row = repo.getRow(id)!;
      expect(row.api_key_cipher).not.toBe(before);
      expect(reloaded.decrypt(row.api_key_cipher!)).toBe(`sk-${ids.indexOf(id)}`);
    }
    expect(reloaded.decrypt(repo.getRow(broken.id)!.api_key_cipher!)).toBeNull();
  });

  it('Desktop：只重封装，不生成 keyId / 不写 legacy 同步标记', () => {
    let nonce = 0;
    const cipher: SecretCipher = {
      mode: 'desktop',
      isAvailable: () => true,
      encrypt: (plaintext) => `v${(nonce += 1)}:${plaintext}`,
      decrypt: (ciphertext) => {
        const match = /^v\d+:([\s\S]+)$/.exec(ciphertext);
        return match?.[1] ?? null;
      },
    };
    const ids = seed(cipher, 1);
    const before = createProviderRepository(db).getRow(ids[0]!)!.api_key_cipher;
    const result = createSecretRotationService({ db, cipher }).rotate();
    expect(result).toMatchObject({
      mode: 'desktop',
      rotated: 1,
      skipped: 0,
      failed: 0,
      keyId: null,
      legacyKeySynced: null,
    });
    expect(createProviderRepository(db).getRow(ids[0]!)!.api_key_cipher).not.toBe(before);
  });

  it('加密能力不可用 → 503；单条加密失败 → failed 且保留旧密文', () => {
    const unavailable: SecretCipher = {
      mode: 'desktop',
      isAvailable: () => false,
      encrypt: (plaintext) => plaintext,
      decrypt: (ciphertext) => ciphertext,
    };
    expect(() =>
      createSecretRotationService({ db, cipher: unavailable }).rotate(),
    ).toThrowError(expect.objectContaining({ code: 'SECRET_ROTATION_UNAVAILABLE', status: 503 }));

    let fail = false;
    const cipher: SecretCipher = {
      mode: 'desktop',
      isAvailable: () => true,
      encrypt: (plaintext) => {
        if (fail && plaintext === 'sk-0') throw new Error('encrypt failed');
        return `v:${plaintext}`;
      },
      decrypt: (ciphertext) => ciphertext.replace(/^v:/, ''),
    };
    const ids = seed(cipher, 1);
    fail = true;
    const result = createSecretRotationService({ db, cipher }).rotate();
    expect(result).toMatchObject({ rotated: 0, failed: 1, failedProviders: ids });
    expect(createProviderRepository(db).getRow(ids[0]!)!.api_key_cipher).toBe('v:sk-0');
  });
});
