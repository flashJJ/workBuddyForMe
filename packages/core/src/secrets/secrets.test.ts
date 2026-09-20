import { existsSync, mkdtempSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { getDataDir, resetDataRootForTest, setDataRootForTest } from '@wbfm/config';
import { createBridgedCipher, createWebCipher, maskSecret } from './cipher';
import { MASTER_KEY_FILENAME } from './master-key';

describe('Web 密钥器 AES-256-GCM（TR-12.1）', () => {
  let tempRoot: string;

  beforeEach(() => {
    tempRoot = mkdtempSync(join(tmpdir(), 'wbfm-secrets-'));
    setDataRootForTest(tempRoot);
  });

  afterEach(() => {
    resetDataRootForTest();
  });

  it('主密钥文件懒创建、长度 32；POSIX 下权限 0600', () => {
    const cipher = createWebCipher();
    const sealed = cipher.encrypt('hello');
    expect(sealed.startsWith('wbfm.v1.')).toBe(true);

    const keyFile = join(getDataDir('keys'), MASTER_KEY_FILENAME);
    expect(existsSync(keyFile)).toBe(true);
    expect(readFileSync(keyFile)).toHaveLength(32);
    if (process.platform !== 'win32') {
      expect(statSync(keyFile).mode & 0o777).toBe(0o600);
    }
  });

  it('加解密往返一致；密文每次不同（随机 IV）', () => {
    const cipher = createWebCipher();
    const a = cipher.encrypt('sk-abcd1234efgh');
    const b = cipher.encrypt('sk-abcd1234efgh');
    expect(a).not.toBe(b);
    expect(cipher.decrypt(a)).toBe('sk-abcd1234efgh');
    expect(cipher.decrypt(b)).toBe('sk-abcd1234efgh');
  });

  it('损坏/篡改/非本格式密文返回 null，不抛异常', () => {
    const cipher = createWebCipher();
    expect(cipher.decrypt('not-a-cipher')).toBeNull();
    expect(cipher.decrypt('wbfm.v1.####notbase64')).toBeNull();
    // 翻转载荷中的一个 base64 字符 → GCM 认证失败
    const sealed = cipher.encrypt('secret');
    const prefix = 'wbfm.v1.';
    const body = sealed.slice(prefix.length);
    const tampered = prefix + body.replace(/[A-Za-z]/, (c) => (c === 'A' ? 'B' : 'A'));
    expect(cipher.decrypt(tampered)).toBeNull();
  });

  it('落盘任何文件都不包含明文 Key', () => {
    const plaintext = 'sk-PLAINTEXT-NO-LEAK-9f8e';
    createWebCipher().encrypt(plaintext);
    const files = readdirSync(tempRoot, { recursive: true }).map((name) =>
      join(tempRoot, name.toString()),
    );
    expect(files.length).toBeGreaterThan(0);
    for (const file of files) {
      if (!statSync(file).isFile()) continue;
      expect(readFileSync(file, 'utf8')).not.toContain(plaintext);
    }
  });

  it('脱敏格式', () => {
    expect(maskSecret('sk-abcd1234efgh')).toBe('sk-****efgh');
    expect(maskSecret('')).toBeNull();
  });
});

describe('Electron safeStorage 桥密钥器', () => {
  it('加解密经桥；桥抛错或不可用时降级为 null', () => {
    const working = createBridgedCipher({
      isEncryptionAvailable: () => true,
      encryptString: (s) => `safe:${s}`,
      decryptString: (s) => s.replace(/^safe:/, ''),
    });
    expect(working.encrypt('key')).toBe('safe:key');
    expect(working.decrypt('safe:key')).toBe('key');

    const throwing = createBridgedCipher({
      isEncryptionAvailable: () => true,
      encryptString: (s) => s,
      decryptString: () => {
        throw new Error('解密失败');
      },
    });
    expect(throwing.decrypt('whatever')).toBeNull();

    const unavailable = createBridgedCipher({
      isEncryptionAvailable: () => false,
      encryptString: (s) => s,
      decryptString: (s) => s,
    });
    expect(unavailable.decrypt('x')).toBeNull();
  });
});
