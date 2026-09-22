import { mkdtempSync, existsSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import zlib from 'node:zlib';
import tar from 'tar-stream';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createDatabase, type DatabaseInstance, createSettingsRepository, createAttachmentRepository, createKnowledgeRepository, createDocumentRepository, createConversationRepository, createMessageRepository, createChunkRepository } from '@wbfm/database';
import { resetDataRootForTest, setDataRootForTest } from '@wbfm/config';
import { exportBackup } from './export';
import { restoreBackup, precheckBackup } from './restore';
import { createWebCipher } from '../secrets/cipher';
import { ensureSeedData } from '../services/seed';

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
    const convRepo = createConversationRepository(srcDb);
    const msgRepo = createMessageRepository(srcDb);
    const kbRepo = createKnowledgeRepository(srcDb);
    const docRepo = createDocumentRepository(srcDb);
    const chunkRepo = createChunkRepository(srcDb);
    const settingsRepo = createSettingsRepository(srcDb);
    const attRepo = createAttachmentRepository(srcDb);

    // 对话 + 消息
    const conv = convRepo.create({ assistantId: 'builtin-general', title: '产品讨论' });
    msgRepo.add({ conversationId: conv.id, role: 'user', content: '介绍一下产品', status: 'completed' });
    msgRepo.add({ conversationId: conv.id, role: 'assistant', content: '好的，我们的产品...', status: 'completed' });

    // 知识库 + 文档 + 分片
    const kb = kbRepo.create({ name: '技术文档', chunkSize: 300, chunkOverlap: 50 });
    const doc = docRepo.create({
      knowledgeBaseId: kb.id, filename: 'readme.md', fileType: 'md',
      byteSize: 200, contentHash: 'abc123', source: 'upload',
    });
    chunkRepo.bulkInsert(doc.id, [
      { ordinal: 0, content: '第一行内容', charStart: 0, charEnd: 5 },
      { ordinal: 1, content: '第二行内容', charStart: 6, charEnd: 10 },
    ]);
    docRepo.setStatus(doc.id, 'indexed', { chunkCount: 2, indexedAt: '2025-06-01T00:00:00Z' });

    // settings
    settingsRepo.setJson('theme', { mode: 'dark' });
    settingsRepo.setJson('sensitive', { encrypted: true, ciphertext: 'SECRET' });

    // 附件
    mkdirSync(join(tempRoot, 'attachments'), { recursive: true });
    const att = attRepo.create({ filename: 'logo.png', mimeType: 'image/png', byteSize: 10, contentHash: 'png-hash' });
    writeFileSync(join(tempRoot, 'attachments', att.storage_path), Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]));

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
    const fakeManifest = JSON.stringify({
      backupSchemaVersion: 99, appVersion: '0.4.0', createdAt: new Date().toISOString(),
      tracks: {
        conversations: { files: '', entryCount: 0 },
        knowledge: { files: '', knowledgeBaseCount: 0, documentCount: 0 },
        settings: { files: '' },
        attachments: { files: '', entryCount: 0, totalBytes: 0 },
      },
    });
    const pack = tar.pack();
    pack.entry({ name: 'manifest.json' }, fakeManifest);
    pack.finalize();
    const archive = await new Promise<Buffer>((resolve, reject) => {
      const chunks: Buffer[] = [];
      pack.pipe(zlib.createGzip()).on('data', (c: unknown) => chunks.push(c as Buffer)).on('end', () => resolve(Buffer.concat(chunks))).on('error', reject);
    });

    const pre = await precheckBackup(archive);
    expect(pre.compatible).toBe(false);
    expect(pre.warnings[0]).toMatch(/版本 99 高于/);

    await expect(restoreBackup({ db: dstDb, cipher: createWebCipher() }, archive)).rejects.toThrow(/版本/);
  });

  it('幂等：重复恢复同一归档，skipped 计数 > 0', async () => {
    ensureSeedData(srcDb);
    const kbRepo = createKnowledgeRepository(srcDb);
    kbRepo.create({ name: '幂等测试', chunkSize: 300, chunkOverlap: 50 });

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
    const convRepo = createConversationRepository(srcDb);
    const kbRepo = createKnowledgeRepository(srcDb);
    const settingsRepo = createSettingsRepository(srcDb);

    convRepo.create({ assistantId: 'builtin-general', title: '应该被跳过' });
    kbRepo.create({ name: '应该被导入', chunkSize: 300, chunkOverlap: 50 });
    settingsRepo.setJson('theme', { mode: 'dark' });

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
    const kbRepo = createKnowledgeRepository(srcDb);
    const docRepo = createDocumentRepository(srcDb);
    const chunkRepo = createChunkRepository(srcDb);

    const kb = kbRepo.create({ name: '测试', chunkSize: 300, chunkOverlap: 50 });
    const doc = docRepo.create({
      knowledgeBaseId: kb.id, filename: 'test.txt', fileType: 'txt',
      byteSize: 100, contentHash: 'h1', source: 'upload',
    });
    chunkRepo.bulkInsert(doc.id, [{ ordinal: 0, content: 'hello', charStart: 0, charEnd: 5 }]);
    docRepo.setStatus(doc.id, 'indexed', { chunkCount: 1, indexedAt: '2025-01-01T00:00:00Z' });

    const { archive } = await exportBackup({ db: srcDb, cipher: createWebCipher() }, { tracks: ['knowledge'] });
    await restoreBackup({ db: dstDb, cipher: createWebCipher() }, archive);

    const dstDocs = createDocumentRepository(dstDb);
    const restored = dstDocs.listByKnowledgeBase(kb.id)[0]!;
    expect(restored.status).toBe('pending');
    // indexedAt 应为 null（需要重新索引）
    expect(restored.indexedAt).toBeNull();
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
