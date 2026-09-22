import { mkdtempSync, existsSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import zlib from 'node:zlib';
import tar from 'tar-stream';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createDatabase, type DatabaseInstance } from '@wbfm/database';
import { resetDataRootForTest, setDataRootForTest } from '@wbfm/config';
import { exportBackup, sanitizeSettings, BACKUP_MAX_ARCHIVE_BYTES } from './export';
import { createWebCipher } from '../secrets/cipher';
import {
  createConversationRepository,
  createMessageRepository,
  createKnowledgeRepository,
  createDocumentRepository,
  createChunkRepository,
  createSettingsRepository,
  createAttachmentRepository,
  createAssistantRepository,
} from '@wbfm/database';

function collectTarEntries(gz: Buffer): Promise<Record<string, string>> {
  return new Promise((resolve, reject) => {
    const gunzip = zlib.createGunzip();
    const extract = tar.extract();
    const out: Record<string, string> = {};
    extract.on('entry', (header, stream, next) => {
      const chunks: Buffer[] = [];
      stream.on('data', (c: unknown) => chunks.push(c as Buffer));
      stream.on('end', () => {
        out[header.name] = Buffer.concat(chunks).toString('utf-8');
        next();
      });
      stream.on('error', reject);
    });
    extract.on('finish', () => resolve(out));
    gunzip.on('error', reject);
    gunzip.pipe(extract);
    gunzip.end(gz);
  });
}

describe('备份导出（M1）', () => {
  let db: DatabaseInstance;
  let tempRoot: string;

  beforeEach(() => {
    tempRoot = mkdtempSync(join(tmpdir(), 'wbfm-bak-'));
    setDataRootForTest(tempRoot);
    db = createDatabase(':memory:');
  });

  afterEach(() => {
    db.close();
    resetDataRootForTest();
  });

  it('四轨空库：manifest 正确 + tar.gz 可解压', async () => {
    const deps = { db, cipher: createWebCipher() };
    const { archive, manifest, size } = await exportBackup(deps, {
      tracks: ['conversations', 'knowledge', 'settings'],
    });

    expect(size).toBeGreaterThan(0);
    expect(manifest.backupSchemaVersion).toBe(1);
    expect(manifest.tracks.conversations.entryCount).toBe(0);
    expect(manifest.tracks.knowledge.knowledgeBaseCount).toBe(0);

    const files = await collectTarEntries(archive);
    expect(files['manifest.json']).toBeDefined();
    expect(files['conversations.json']).toBe('[]');
    expect(files['knowledge.json']).toBe('[]');
    expect(files['settings.json']).toBeDefined();
  });

  it('有对话+知识库：内容完整序列化', async () => {
    const { ensureSeedData } = await import('../services/seed');
    ensureSeedData(db);
    const convRepo = createConversationRepository(db);
    const msgRepo = createMessageRepository(db);
    const kbRepo = createKnowledgeRepository(db);
    const docRepo = createDocumentRepository(db);
    const chunkRepo = createChunkRepository(db);

    const conv = convRepo.create({ assistantId: 'builtin-general', title: '测试对话' });
    msgRepo.add({ conversationId: conv.id, role: 'user', content: '你好', status: 'completed' });
    msgRepo.add({ conversationId: conv.id, role: 'assistant', content: '嗨！', status: 'completed' });

    const kb = kbRepo.create({ name: '产品库', chunkSize: 500, chunkOverlap: 80 });
    const doc = docRepo.create({
      knowledgeBaseId: kb.id,
      filename: '产品.md',
      fileType: 'md',
      byteSize: 100,
      contentHash: 'hash123',
      source: 'upload',
    });
    chunkRepo.bulkInsert(doc.id, [
      { ordinal: 0, content: '第一段产品描述', charStart: 0, charEnd: 12 },
      { ordinal: 1, content: '第二段产品特性', charStart: 12, charEnd: 24 },
    ]);
    docRepo.setStatus(doc.id, 'indexed', { chunkCount: 2, indexedAt: '2025-01-01T00:00:00Z' });

    const { archive } = await exportBackup({ db, cipher: createWebCipher() }, {
      tracks: ['conversations', 'knowledge'],
    });

    const files = await collectTarEntries(archive);
    const convs = JSON.parse(files['conversations.json']!);
    expect(convs).toHaveLength(1);
    expect(convs[0].conversation.title).toBe('测试对话');
    expect(convs[0].messages).toHaveLength(2);

    const kbs = JSON.parse(files['knowledge.json']!);
    expect(kbs).toHaveLength(1);
    expect(kbs[0].knowledgeBase.name).toBe('产品库');
    expect(kbs[0].documents).toHaveLength(1);
    expect(kbs[0].documents[0].document.filename).toBe('产品.md');
    expect(kbs[0].documents[0].chunks).toHaveLength(2);
    expect(kbs[0].documents[0].chunks[0].content).toBe('第一段产品描述');
  });

  it('settings 脱敏：encrypted:true 的 ciphertext 替换为 [REDACTED]', async () => {
    const settingsRepo = createSettingsRepository(db);
    settingsRepo.setJson('defaultModel', { id: 'chat-model' });
    settingsRepo.setJson('providerCredentials', {
      encrypted: true,
      ciphertext: 'super-secret-base64-blob',
    });
    settingsRepo.setJson('nested', {
      api: { encrypted: true, ciphertext: 'another-secret', key: 'sk-abc' },
    });

    const { archive } = await exportBackup({ db, cipher: createWebCipher() }, {
      tracks: ['settings'],
    });

    const files = await collectTarEntries(archive);
    const parsed = JSON.parse(files['settings.json']!);
    expect(parsed.defaultModel).toEqual({ id: 'chat-model' });
    expect(parsed.providerCredentials.ciphertext).toBe('[REDACTED]');
    expect(parsed.providerCredentials.encrypted).toBe(true);
    expect(parsed.nested.api.ciphertext).toBe('[REDACTED]');
    // 非敏感字段保留
    expect(parsed.nested.api.key).toBe('sk-abc');
  });

  it('仅选 conversations 轨：归档无 knowledge/settings 文件', async () => {
    const { archive } = await exportBackup({ db, cipher: createWebCipher() }, {
      tracks: ['conversations'],
    });
    const files = await collectTarEntries(archive);
    expect(files['conversations.json']).toBeDefined();
    expect(files['knowledge.json']).toBeUndefined();
    expect(files['settings.json']).toBeUndefined();
    expect(files['manifest.json']).toBeDefined();
  });

  it('上限常量：BACKUP_MAX_ARCHIVE_BYTES = 500MB', () => {
    expect(BACKUP_MAX_ARCHIVE_BYTES).toBe(500 * 1024 * 1024);
  });
});

describe('sanitizeSettings 纯函数', () => {
  it('deepSanitize 递归处理嵌套对象和数组', () => {
    const raw = {
      flat: { encrypted: true, ciphertext: 'SECRET', id: 'ok' },
      nested: { a: { encrypted: true, ciphertext: 'NESTED' } },
      arr: [{ encrypted: true, ciphertext: 'ARR_SEC' }, 'plain'],
    };
    const out: any = sanitizeSettings(raw);
    expect(out.flat.ciphertext).toBe('[REDACTED]');
    expect(out.flat.id).toBe('ok');
    expect(out.nested.a.ciphertext).toBe('[REDACTED]');
    expect(out.arr[0].ciphertext).toBe('[REDACTED]');
    expect(out.arr[1]).toBe('plain');
  });

  it('无 encrypted 字段的值原样保留', () => {
    const raw = { normal: { foo: 1 }, arr: [1, 2, 3] };
    expect(sanitizeSettings(raw)).toEqual(raw);
  });
});
