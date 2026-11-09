/**
 * v2.33 M2：附件引用计数——启动回填、产物登记、refs.json 导出/恢复。
 */
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  createAttachmentRefRepository,
  createDatabase,
  createMessageRepository,
  type DatabaseInstance,
} from '@wbfm/database';
import { resetDataRootForTest, setDataRootForTest } from '@wbfm/config';
import { createAttachmentService } from '../services/assistant/attachment-service';
import { backfillAttachmentRefs } from '../services/assistant/attachment-refs-backfill';
import { createWebCipher } from '../secrets/cipher';
import { exportBackup } from './export';
import { packTarGz } from './export-archive';
import { extractArchive, extractArchiveFull } from './restore-archive';
import { restoreBackup } from './restore';

let db: DatabaseInstance;
let tempRoot: string;

function seedLegacyData(target: DatabaseInstance): void {
  target.prepare(`INSERT INTO assistants(id,name,created_at,updated_at) VALUES('a','助手','t','t')`).run();
  target.prepare(
    `INSERT INTO conversations(id,assistant_id,title,created_at,updated_at) VALUES('c','a','t','t','t')`,
  ).run();
  target.prepare(
    `INSERT INTO attachments(id, filename, mime_type, byte_size, storage_path, content_hash, created_at)
     VALUES('att1','a.png','image/png',1,'att1.png','h1','2026-01-01T00:00:00.000Z'),
           ('att2','b.png','image/png',1,'att2.png','h2','2026-01-01T00:00:00.000Z')`,
  ).run();
  // 模拟 v2.32 存量消息：只有 content_parts，没有引用行
  target.prepare(
    `INSERT INTO messages(id, conversation_id, role, content, status, content_parts, created_at)
     VALUES('m1','c','user','看图','completed', ?, '2026-01-02T00:00:00.000Z')`,
  ).run(JSON.stringify([
    { type: 'image', attachmentId: 'att1' },
    { type: 'image', attachmentId: 'att2' },
  ]));
}

describe('附件引用回填与产物登记（v2.33 M2）', () => {
  beforeEach(() => {
    tempRoot = mkdtempSync(join(tmpdir(), 'wbfm-attrefs-'));
    setDataRootForTest(tempRoot);
    db = createDatabase(':memory:');
  });

  afterEach(() => {
    db.close();
    resetDataRootForTest();
    if (existsSync(tempRoot)) rmSync(tempRoot, { recursive: true, force: true });
  });

  it('启动回填幂等：首次重建引用，二次按标记跳过，force 不产生重复行', () => {
    seedLegacyData(db);
    const refs = createAttachmentRefRepository(db);

    const first = backfillAttachmentRefs(db);
    expect(first).toEqual({ skipped: false, inserted: 2 });
    expect(refs.listByOwner('message', 'm1')).toHaveLength(2);

    expect(backfillAttachmentRefs(db)).toEqual({ skipped: true, inserted: 0 });
    expect(backfillAttachmentRefs(db, { force: true })).toEqual({ skipped: false, inserted: 0 });
    expect(refs.list()).toHaveLength(2);
  });

  it('saveArtifact 登记 artifact 引用，附件行删除时级联清理', () => {
    const service = createAttachmentService({ db, cipher: createWebCipher() });
    const artifact = service.saveArtifact({
      title: '报告',
      filename: 'report.html',
      format: 'html',
      content: '<h1>hi</h1>',
    });
    const refs = createAttachmentRefRepository(db).list();
    expect(refs).toHaveLength(1);
    expect(refs[0]).toMatchObject({
      attachmentId: artifact.attachmentId,
      ownerType: 'artifact',
      ownerId: artifact.attachmentId,
    });

    db.prepare(`DELETE FROM attachments WHERE id = ?`).run(artifact.attachmentId);
    expect(createAttachmentRefRepository(db).list()).toHaveLength(0);
  });

  it('refs.json 随 attachments 轨导出，恢复后条数与 manifest 一致', async () => {
    seedLegacyData(db);
    backfillAttachmentRefs(db);
    // 产物引用也进入 refs.json
    createAttachmentService({ db, cipher: createWebCipher() }).saveArtifact({
      title: '报告',
      filename: 'report.html',
      format: 'html',
      content: '<h1>hi</h1>',
    });
    const expected = createAttachmentRefRepository(db).list().length;
    expect(expected).toBe(3);

    const deps = { db, cipher: createWebCipher() };
    const exported = await exportBackup(deps, { tracks: ['attachments'] });
    expect(exported.manifest.tracks.attachments.refCount).toBe(expected);

    const extracted = await extractArchive(exported.archive);
    const refsJson = extracted.files.get('refs.json');
    expect(refsJson).toBeTruthy();
    expect((JSON.parse(refsJson!.toString('utf-8')) as unknown[]).length).toBe(expected);

    const target = createDatabase(':memory:');
    try {
      const restored = await restoreBackup({ db: target, cipher: createWebCipher() }, exported.archive, {
        tracks: ['attachments'],
      });
      expect(restored.imported.attachmentRefs).toBe(expected);
      expect(createAttachmentRefRepository(target).list()).toHaveLength(expected);
    } finally {
      target.close();
    }
  });

  it('旧归档缺 refs.json：恢复后立即回填消息引用并给出警告', async () => {
    seedLegacyData(db);
    const deps = { db, cipher: createWebCipher() };
    const { archive, manifest } = await exportBackup(deps, {
      tracks: ['attachments', 'conversations'],
    });

    // 模拟 v2.32 归档：移除 refs.json 后重新打包
    const extracted = await extractArchiveFull(archive);
    const legacyFiles: Record<string, string> = {};
    for (const [name, content] of extracted.files) {
      if (name === 'refs.json') continue;
      legacyFiles[name] = content.toString('utf-8');
    }
    const legacyArchive = await packTarGz(legacyFiles, extracted.binaries, manifest);

    const target = createDatabase(':memory:');
    try {
      // 归档内会话引用助手 'a'，目标库先补助手行（恢复端外键前置）
      target.prepare(
        `INSERT INTO assistants(id,name,created_at,updated_at) VALUES('a','助手','t','t')`,
      ).run();
      const restored = await restoreBackup(
        { db: target, cipher: createWebCipher() },
        legacyArchive,
        { tracks: ['attachments', 'conversations'] },
      );
      expect(restored.imported.messages).toBe(1);
      expect(restored.imported.attachments).toBe(2);
      expect(createAttachmentRefRepository(target).listByOwner('message', 'm1')).toHaveLength(2);
      expect(restored.warnings.some((w) => w.includes('引用清单'))).toBe(true);
    } finally {
      target.close();
    }
  });
});
