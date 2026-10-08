import { mkdtempSync, existsSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createDatabase, type DatabaseInstance, createSettingsRepository, createAttachmentRepository, createKnowledgeRepository, createDocumentRepository, createConversationRepository, createMessageRepository, createChunkRepository, createSkillStateRepository } from '@wbfm/database';
import { resetDataRootForTest, setDataRootForTest } from '@wbfm/config';
import { exportBackup } from './export';
import { restoreBackup, precheckBackup } from './restore';
import { createWebCipher } from '../secrets/cipher';
import { ensureSeedData } from '../services/seed';
import { seedConversationWithMessages, seedConversation, seedIndexedKnowledge, seedKnowledgeBase, seedDarkThemeSetting, seedMixedSettings, seedAttachment, seedSkillFixture, packManifestArchive } from './restore.helpers';

describe('备份恢复（M1）', () => {
  let srcDb: DatabaseInstance;
  let dstDb: DatabaseInstance;
  let tempRoot: string;

  beforeEach(() => {
    tempRoot = mkdtempSync(join(tmpdir(), 'wbfm-restore-'));
    setDataRootForTest(tempRoot);
    srcDb = createDatabase(':memory:');
    dstDb = createDatabase(':memory:');
  });

  afterEach(() => {
    srcDb.close();
    dstDb.close();
    resetDataRootForTest();
    if (existsSync(tempRoot)) rmSync(tempRoot, { recursive: true, force: true });
  });

  it('四轨 roundtrip：导出→恢复→DB 数据一致', async () => {
    // 源库：seed + 插入数据
    ensureSeedData(srcDb);

    // 对话 + 消息
    const conv = seedConversationWithMessages(srcDb);

    // 知识库 + 文档 + 分片
    const { kb, doc } = seedIndexedKnowledge(srcDb);

    // settings
    seedMixedSettings(srcDb);

    // 附件
    seedAttachment(srcDb, tempRoot);

    // 导出（四轨全选）
    const deps = { db: srcDb, cipher: createWebCipher() };
    const { archive } = await exportBackup(deps, {
      tracks: ['conversations', 'knowledge', 'settings', 'attachments'],
    });

    // 预检查
    const pre = await precheckBackup(archive);
    expect(pre.compatible).toBe(true);
    expect(pre.tracks.conversations).toBe(1);
    expect(pre.tracks.knowledgeBases).toBe(1);
    expect(pre.tracks.documents).toBe(1);
    expect(pre.tracks.attachments).toBe(1);
    // settings 有 [REDACTED] 占位——但这里我们源库写的是明文，sanitizeSettings 会替换 ciphertext
    expect(pre.warnings.some((w) => w.includes('脱敏'))).toBe(true);

    // 恢复到目标库
    const restoreDeps = { db: dstDb, cipher: createWebCipher() };
    const result = await restoreBackup(restoreDeps, archive);

    // 验证结果
    expect(result.imported.conversations).toBe(1);
    expect(result.imported.messages).toBe(2);
    expect(result.imported.knowledgeBases).toBe(1);
    expect(result.imported.documents).toBe(1);
    expect(result.imported.chunks).toBe(2);
    expect(result.imported.settings).toBe(1);
    expect(result.imported.attachments).toBe(1);
    expect(result.skipped.conversations).toBe(0);
    expect(result.skipped.documents).toBe(0);

    // 目标库数据验证
    const dstConvs = createConversationRepository(dstDb);
    const dstMsgs = createMessageRepository(dstDb);
    const dstKbs = createKnowledgeRepository(dstDb);
    const dstDocs = createDocumentRepository(dstDb);
    const dstChunks = createChunkRepository(dstDb);
    const dstSettings = createSettingsRepository(dstDb);
    const dstAtts = createAttachmentRepository(dstDb);

    const allConvs = dstConvs.list();
    expect(allConvs).toHaveLength(1);
    expect(allConvs[0]!.id).toBe(conv.id); // id 保留
    expect(allConvs[0]!.title).toBe('产品讨论');
    expect(dstMsgs.listByConversation(conv.id)).toHaveLength(2);

    const allKbs = dstKbs.list();
    expect(allKbs).toHaveLength(1);
    expect(allKbs[0]!.id).toBe(kb.id);
    expect(allKbs[0]!.name).toBe('技术文档');

    const allDocs = dstDocs.listByKnowledgeBase(kb.id);
    expect(allDocs).toHaveLength(1);
    expect(allDocs[0]!.id).toBe(doc.id);
    expect(allDocs[0]!.status).toBe('pending'); // needs_reindex
    expect(dstChunks.listByDocument(doc.id)).toHaveLength(2);

    expect((dstSettings.all() as any).theme).toEqual({ mode: 'dark' });

    const allAtts = dstAtts.list();
    expect(allAtts).toHaveLength(1);
    expect(allAtts[0]!.filename).toBe('logo.png');
    // 二进制文件应存在
    expect(existsSync(join(tempRoot, 'attachments', allAtts[0]!.storage_path))).toBe(true);
  });

  it('空库恢复：result 全 0 但不报错', async () => {
    ensureSeedData(srcDb);
    const deps = { db: srcDb, cipher: createWebCipher() };
    const { archive } = await exportBackup(deps, { tracks: ['settings'] });

    const pre = await precheckBackup(archive);
    expect(pre.compatible).toBe(true);
    expect(pre.tracks.conversations).toBe(0);

    const result = await restoreBackup({ db: dstDb, cipher: createWebCipher() }, archive);
    expect(result.imported.settings).toBe(1);
    expect(result.imported.conversations).toBe(0);
    expect(result.skipped.conversations).toBe(0);
  });

  it('版本不兼容：precheck.compatible=false + restore 抛错', async () => {
    // 构造一个假 archive：manifest.version=99
    const archive = await packManifestArchive({
      backupSchemaVersion: 99, appVersion: '0.4.0', createdAt: new Date().toISOString(),
      tracks: {
        conversations: { files: '', entryCount: 0 },
        knowledge: { files: '', knowledgeBaseCount: 0, documentCount: 0 },
        settings: { files: '' },
        attachments: { files: '', entryCount: 0, totalBytes: 0 },
      },
    });

    const pre = await precheckBackup(archive);
    expect(pre.compatible).toBe(false);
    expect(pre.warnings[0]).toMatch(/版本 99 高于/);

    await expect(restoreBackup({ db: dstDb, cipher: createWebCipher() }, archive)).rejects.toThrow(/版本/);
  });

  it('幂等：重复恢复同一归档，skipped 计数 > 0', async () => {
    ensureSeedData(srcDb);
    seedKnowledgeBase(srcDb, '幂等测试');

    const { archive } = await exportBackup({ db: srcDb, cipher: createWebCipher() }, { tracks: ['knowledge'] });

    // 第一次恢复
    const r1 = await restoreBackup({ db: dstDb, cipher: createWebCipher() }, archive);
    expect(r1.imported.knowledgeBases).toBe(1);
    expect(r1.skipped.knowledgeBases).toBe(0);

    // 第二次恢复（同目标库）
    const r2 = await restoreBackup({ db: dstDb, cipher: createWebCipher() }, archive);
    expect(r2.imported.knowledgeBases).toBe(0);
    expect(r2.skipped.knowledgeBases).toBe(1); // INSERT OR IGNORE 跳过已存在
  });

  it('仅指定 knowledge 轨恢复：conversations/settings 不导入', async () => {
    ensureSeedData(srcDb);
    seedConversation(srcDb, '应该被跳过');
    seedKnowledgeBase(srcDb, '应该被导入');
    seedDarkThemeSetting(srcDb);

    const { archive } = await exportBackup({ db: srcDb, cipher: createWebCipher() }, {
      tracks: ['conversations', 'knowledge', 'settings'],
    });

    // 仅恢复 knowledge
    const result = await restoreBackup({ db: dstDb, cipher: createWebCipher() }, archive, { tracks: ['knowledge'] });
    expect(result.imported.knowledgeBases).toBe(1);
    expect(result.imported.conversations).toBe(0);
    expect(result.imported.settings).toBe(0);

    // 目标库验证
    const dstKbs = createKnowledgeRepository(dstDb);
    const dstConvs = createConversationRepository(dstDb);
    expect(dstKbs.list()).toHaveLength(1);
    expect(dstConvs.list()).toHaveLength(0);
    expect(createSettingsRepository(dstDb).all()).toEqual({});
  });

  it('恢复后 documents.status = pending（needs_reindex）', async () => {
    ensureSeedData(srcDb);
    const { kb, doc } = seedIndexedKnowledge(srcDb, {
      name: '测试', filename: 'test.txt', fileType: 'txt', byteSize: 100, contentHash: 'h1',
      chunks: [{ ordinal: 0, content: 'hello', charStart: 0, charEnd: 5 }],
      indexedAt: '2025-01-01T00:00:00Z',
    });

    const { archive } = await exportBackup({ db: srcDb, cipher: createWebCipher() }, { tracks: ['knowledge'] });
    await restoreBackup({ db: dstDb, cipher: createWebCipher() }, archive);

    const dstDocs = createDocumentRepository(dstDb);
    const restored = dstDocs.listByKnowledgeBase(kb.id)[0]!;
    expect(restored.status).toBe('pending');
    // indexedAt 应为 null（需要重新索引）
    expect(restored.indexedAt).toBeNull();
  });

  it('skills 轨 roundtrip：文件夹落盘 + 启停偏好按 name upsert（v0.6 M3）', async () => {
    const { skillsDir, manifestContent } = seedSkillFixture(srcDb, tempRoot);

    const { archive } = await exportBackup({ db: srcDb, cipher: createWebCipher() }, { tracks: ['skills'] });
    const pre = await precheckBackup(archive);
    expect(pre.compatible).toBe(true);
    expect(pre.tracks.skills).toBe(1);

    // 模拟目标机：源文件夹不存在；目标库已有同名状态行（reconcile 预登记，新 id、enabled=true）
    rmSync(skillsDir, { recursive: true, force: true });
    const dstState = createSkillStateRepository(dstDb);
    dstState.create({ name: 'weekly-report', enabled: true, sourcePath: '/other/path' });

    const result = await restoreBackup({ db: dstDb, cipher: createWebCipher() }, archive);
    expect(result.imported.skills).toBe(1);
    expect(result.skipped.skills).toBe(0);

    // 文件夹重建且 skill.json 逐字节一致；启停偏好按 name 覆盖且目标库仍一行
    const restored = join(skillsDir, 'weekly-report', 'skill.json');
    expect(readFileSync(restored, 'utf-8')).toBe(manifestContent);
    expect(dstState.getByName('weekly-report')!.enabled).toBe(false);
    expect(dstState.list()).toHaveLength(1);

    // 幂等：重复恢复 → 文件夹已存在走 skipped，状态重复 upsert 不报错
    const r2 = await restoreBackup({ db: dstDb, cipher: createWebCipher() }, archive);
    expect(r2.imported.skills).toBe(0);
    expect(r2.skipped.skills).toBe(1);
    expect(dstState.list()).toHaveLength(1);
  });

  it('conversations 的 assistant 不存在：外键约束静默跳过', async () => {
    ensureSeedData(srcDb);
    // 临时关闭 FK，在源库用不存在的 assistantId 创建孤儿 conversation
    srcDb.pragma('foreign_keys = OFF');
    srcDb.prepare(
      `INSERT INTO conversations(id, assistant_id, title, last_message_at, created_at, updated_at)
       VALUES (?, ?, ?, NULL, ?, ?)`,
    ).run('orphan-conv', 'nonexistent-assistant', '孤儿对话', new Date().toISOString(), new Date().toISOString());
    srcDb.pragma('foreign_keys = ON');

    const { archive } = await exportBackup({ db: srcDb, cipher: createWebCipher() }, { tracks: ['conversations'] });

    // 目标库只有 seed 的 builtin-general——orphan-conv 的 assistant 不存在 → 跳过
    const result = await restoreBackup({ db: dstDb, cipher: createWebCipher() }, archive);
    expect(result.imported.conversations).toBe(0);
    expect(result.skipped.conversations).toBe(1);
  });
});
