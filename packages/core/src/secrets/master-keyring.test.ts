import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { getDataDir, resetDataRootForTest, setDataRootForTest } from '@wbfm/config';
import { createWebCipher } from './cipher';
import { openWithKey } from './crypto-box';
import { MASTER_KEYRING_FILENAME } from './master-keyring';
import { MASTER_KEY_FILENAME } from './master-key';

describe('v2.15 Web 主密钥 keyring', () => {
  beforeEach(() => {
    setDataRootForTest(mkdtempSync(join(tmpdir(), 'wbfm-keyring-')));
  });

  afterEach(() => {
    resetDataRootForTest();
  });

  function ringPath(): string {
    return join(getDataDir('keys'), MASTER_KEYRING_FILENAME);
  }

  function legacyPath(): string {
    return join(getDataDir('keys'), MASTER_KEY_FILENAME);
  }

  it('新装：创建 keyring 与 legacy master.key，密文可解', () => {
    const cipher = createWebCipher();
    const ciphertext = cipher.encrypt('sk-sentinel-new');
    expect(cipher.decrypt(ciphertext)).toBe('sk-sentinel-new');
    const ring = JSON.parse(readFileSync(ringPath(), 'utf8')) as {
      activeKeyId: string;
      keys: Array<{ id: string }>;
    };
    expect(ring.keys).toHaveLength(1);
    expect(ring.activeKeyId).toBe(ring.keys[0]!.id);
    expect(readFileSync(legacyPath()).length).toBe(32);
  });

  it('legacy master.key：读入为 legacy，轮换后旧密文仍可解，active 同步回旧文件', () => {
    mkdirSync(getDataDir('keys'), { recursive: true });
    const legacyKey = Buffer.alloc(32, 7);
    writeFileSync(legacyPath(), legacyKey);
    const cipher = createWebCipher();
    const oldCiphertext = cipher.encrypt('sk-old');
    expect(cipher.decrypt(oldCiphertext)).toBe('sk-old');

    const keyId = cipher.rotateKey!();
    expect(keyId).toBeTruthy();
    const ring = JSON.parse(readFileSync(ringPath(), 'utf8')) as {
      activeKeyId: string;
      keys: Array<{ id: string }>;
    };
    expect(ring.activeKeyId).toBe(keyId);
    expect(ring.keys).toHaveLength(2);
    expect(cipher.decrypt(oldCiphertext)).toBe('sk-old');

    cipher.finalizeKeyRotation!(true);
    const trimmed = JSON.parse(readFileSync(ringPath(), 'utf8')) as { keys: unknown[] };
    expect(trimmed.keys).toHaveLength(2);

    const newCiphertext = cipher.encrypt('sk-new');
    expect(cipher.syncLegacyKey!()).toBe(true);
    expect(openWithKey(newCiphertext, readFileSync(legacyPath()))).toBe('sk-new');
  });

  it('多次轮换最多保留 3 把；干净轮换后裁剪到 active + previous', () => {
    const cipher = createWebCipher();
    cipher.rotateKey!();
    cipher.rotateKey!();
    let ring = JSON.parse(readFileSync(ringPath(), 'utf8')) as { keys: unknown[] };
    expect(ring.keys.length).toBeLessThanOrEqual(3);

    cipher.finalizeKeyRotation!(true);
    ring = JSON.parse(readFileSync(ringPath(), 'utf8')) as { keys: unknown[] };
    expect(ring.keys).toHaveLength(2);
  });

  it('keyring 损坏时抛出，不静默生成新密钥', () => {
    mkdirSync(getDataDir('keys'), { recursive: true });
    const broken = {
      formatVersion: 1,
      activeKeyId: 'bad',
      keys: [{ id: 'bad', key: 'not-a-32-byte-key', createdAt: new Date().toISOString() }],
    };
    writeFileSync(ringPath(), JSON.stringify(broken));
    const cipher = createWebCipher();
    expect(() => cipher.encrypt('x')).toThrow();
  });
});
