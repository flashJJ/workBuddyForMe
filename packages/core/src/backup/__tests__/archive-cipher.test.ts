/**
 * v2.33 M1：加密归档容器 + 导出/预检链路。
 * 断言：roundtrip、明文直通、缺密码/错密码/篡改分码、加密导出可被预检解开。
 */
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createDatabase, type DatabaseInstance } from '@wbfm/database';
import { resetDataRootForTest, setDataRootForTest } from '@wbfm/config';
import { ApiError } from '@wbfm/shared/errors';
import { isEncryptedArchive, openArchive, sealArchive } from '../portability/archive-cipher';
import { exportBackup } from '../export';
import { precheckBackup } from '../restore-precheck';
import { createWebCipher } from '../../secrets/cipher';

const PASSWORD = 'correct-horse-8';
const WRONG_PASSWORD = 'wrong-horse-88';

async function expectApiError(run: () => Promise<unknown>, code: string): Promise<void> {
  try {
    await run();
  } catch (error) {
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).code).toBe(code);
    return;
  }
  throw new Error(`期望抛出 ${code}`);
}

describe('archive-cipher（v2.33 M1）', () => {
  it('seal/open roundtrip：密文不含明文，头可读', () => {
    const plain = Buffer.from('manifest 明文内容', 'utf-8');
    const sealed = sealArchive(plain, PASSWORD);

    expect(isEncryptedArchive(sealed)).toBe(true);
    expect(sealed.includes(Buffer.from('manifest 明文内容'))).toBe(false);

    const headerLength = sealed.readUInt32BE(9);
    const header = JSON.parse(sealed.subarray(13, 13 + headerLength).toString('utf-8')) as {
      kdf: string;
      N: number;
      r: number;
      p: number;
      salt: string;
      iv: string;
    };
    expect(header.kdf).toBe('scrypt');
    expect(header.N).toBe(2 ** 15);
    expect(header.r).toBe(8);
    expect(header.p).toBe(1);
    expect(header.salt.length).toBeGreaterThan(0);
    expect(header.iv.length).toBeGreaterThan(0);

    expect(openArchive(sealed, PASSWORD).equals(plain)).toBe(true);
  });

  it('每次导出使用新的 salt 与 iv', () => {
    const plain = Buffer.from('same payload');
    expect(sealArchive(plain, PASSWORD).equals(sealArchive(plain, PASSWORD))).toBe(false);
  });

  it('明文归档原样直通', () => {
    const plain = Buffer.from('not encrypted');
    expect(openArchive(plain)).toBe(plain);
  });

  it('缺密码 / 错密码 / 篡改分别给出明确错误码', async () => {
    const sealed = sealArchive(Buffer.from('payload'), PASSWORD);
    await expectApiError(async () => openArchive(sealed), 'BACKUP_PASSWORD_REQUIRED');
    await expectApiError(async () => openArchive(sealed, WRONG_PASSWORD), 'BACKUP_PASSWORD_INVALID');

    const tampered = Buffer.from(sealed);
    const last = tampered.length - 1;
    tampered.writeUInt8(tampered.readUInt8(last) ^ 0xff, last);
    await expectApiError(async () => openArchive(tampered, PASSWORD), 'BACKUP_PASSWORD_INVALID');
  });
});

describe('加密导出与预检（v2.33 M1）', () => {
  let db: DatabaseInstance;
  let tempRoot: string;

  beforeEach(() => {
    tempRoot = mkdtempSync(join(tmpdir(), 'wbfm-encrypted-'));
    setDataRootForTest(tempRoot);
    db = createDatabase(':memory:');
  });

  afterEach(() => {
    db.close();
    resetDataRootForTest();
    if (existsSync(tempRoot)) rmSync(tempRoot, { recursive: true, force: true });
  });

  it('加密导出可带密码预检，未加密输出保持 v2.32 结构', async () => {
    const deps = { db, cipher: createWebCipher() };

    const encrypted = await exportBackup(deps, { tracks: ['settings'], password: PASSWORD });
    expect(encrypted.encrypted).toBe(true);
    expect(isEncryptedArchive(encrypted.archive)).toBe(true);
    const precheck = await precheckBackup(encrypted.archive, { password: PASSWORD });
    expect(precheck.compatible).toBe(true);

    const plain = await exportBackup(deps, { tracks: ['settings'] });
    expect(plain.encrypted).toBe(false);
    expect(isEncryptedArchive(plain.archive)).toBe(false);
    expect(plain.archive.subarray(0, 2)).toEqual(Buffer.from([0x1f, 0x8b]));
  });

  it('加密归档预检：缺密码/错密码返回对应错误码', async () => {
    const deps = { db, cipher: createWebCipher() };
    const { archive } = await exportBackup(deps, { tracks: ['settings'], password: PASSWORD });

    await expectApiError(() => precheckBackup(archive), 'BACKUP_PASSWORD_REQUIRED');
    await expectApiError(
      () => precheckBackup(archive, { password: WRONG_PASSWORD }),
      'BACKUP_PASSWORD_INVALID',
    );
  });
});
