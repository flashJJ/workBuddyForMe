/**
 * v2.32 M1：POST /api/backup/precheck 只读预检测试。
 * 断言：预检前后数据库与附件目录不变；版本高于当前时 compatible=false。
 */
import { existsSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  createDatabase,
  createKnowledgeRepository,
  type DatabaseInstance,
} from '@wbfm/database';
import { resetDataRootForTest, setDataRootForTest } from '@wbfm/config';
import { createWebCipher } from '@wbfm/core/secrets';
import {
  CURRENT_BACKUP_SCHEMA_VERSION,
  type BackupManifest,
} from '@wbfm/shared/backup';
import { exportBackup, packTarGz } from '@wbfm/core/backup';
import { __buildContainerForTest, __setContainerForTest } from '@/lib/server/container';
import { POST as precheckRoute } from './route';

function uploadRequest(archive: Buffer, password?: string): Request {
  const form = new FormData();
  form.append('file', new File([new Uint8Array(archive)], 'backup.tar.gz'));
  if (password) form.append('password', password);
  return new Request('http://x/api/backup/precheck', { method: 'POST', body: form });
}

describe('POST /api/backup/precheck（v2.32 M1）', () => {
  let db: DatabaseInstance;
  let tempRoot: string;

  beforeEach(() => {
    tempRoot = mkdtempSync(join(tmpdir(), 'wbfm-precheck-'));
    setDataRootForTest(tempRoot);
    db = createDatabase(':memory:');
    __setContainerForTest(__buildContainerForTest(db, createWebCipher()));
  });

  afterEach(() => {
    __setContainerForTest(null);
    db.close();
    resetDataRootForTest();
    if (existsSync(tempRoot)) rmSync(tempRoot, { recursive: true, force: true });
  });

  it('只读预检：返回轨道计数，且不写库、不落盘附件', async () => {
    createKnowledgeRepository(db).create({ name: '知识库', chunkSize: 500, chunkOverlap: 50 });

    const countKb = () =>
      (db.prepare('SELECT COUNT(*) AS n FROM knowledge_bases').get() as { n: number }).n;
    const before = countKb();

    const { archive } = await exportBackup({ db, cipher: createWebCipher() }, {
      tracks: ['knowledge'],
    });

    const response = await precheckRoute(uploadRequest(archive));
    expect(response.status).toBe(200);
    const payload = (await response.json()) as {
      success: boolean;
      data: { compatible: boolean; tracks: { knowledgeBases: number } };
    };
    expect(payload.success).toBe(true);
    expect(payload.data.compatible).toBe(true);
    expect(payload.data.tracks.knowledgeBases).toBe(before);

    expect(countKb()).toBe(before);
    const attDir = join(tempRoot, 'attachments');
    expect(existsSync(attDir) ? readdirSync(attDir) : []).toHaveLength(0);
  });

  it('加密归档：缺密码返回 422 对应错误码，正确密码可预检', async () => {
    const password = 'correct-horse-8';
    const { archive } = await exportBackup({ db, cipher: createWebCipher() }, {
      tracks: ['settings'],
      password,
    });

    const missing = await precheckRoute(uploadRequest(archive));
    expect(missing.status).toBe(422);
    const missingBody = (await missing.json()) as { error: { code: string } };
    expect(missingBody.error.code).toBe('BACKUP_PASSWORD_REQUIRED');

    const wrong = await precheckRoute(uploadRequest(archive, 'wrong-horse-88'));
    expect(wrong.status).toBe(422);
    const wrongBody = (await wrong.json()) as { error: { code: string } };
    expect(wrongBody.error.code).toBe('BACKUP_PASSWORD_INVALID');

    const ok = await precheckRoute(uploadRequest(archive, password));
    expect(ok.status).toBe(200);
    const okBody = (await ok.json()) as { data: { compatible: boolean } };
    expect(okBody.data.compatible).toBe(true);
  });

  it('归档 schema 高于当前：compatible=false 并给出升级提示', async () => {
    const { manifest } = await exportBackup({ db, cipher: createWebCipher() }, {
      tracks: ['settings'],
    });
    const futureManifest: BackupManifest = {
      ...manifest,
      backupSchemaVersion: CURRENT_BACKUP_SCHEMA_VERSION + 1,
    };
    const archive = await packTarGz({}, [], futureManifest);

    const response = await precheckRoute(uploadRequest(archive));
    expect(response.status).toBe(200);
    const payload = (await response.json()) as {
      data: { compatible: boolean; warnings: string[] };
    };
    expect(payload.data.compatible).toBe(false);
    expect(payload.data.warnings[0]).toContain('高于当前支持');
  });
});
