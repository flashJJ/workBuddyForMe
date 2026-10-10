/**
 * restore.test.ts 专用夹具与构造工厂（热点拆分：只搬代码，不改逻辑）。
 * 不与 restore-tasks.test.ts 共用，仅供本测使用。
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import zlib from 'node:zlib';
import tar from 'tar-stream';
import {
  type DatabaseInstance,
  createConversationRepository,
  createMessageRepository,
  createKnowledgeRepository,
  createDocumentRepository,
  createChunkRepository,
  createSettingsRepository,
  createAttachmentRepository,
  createSkillStateRepository,
} from '@wbfm/database';

/** 一个对话 + 两条消息，返回创建的 conversation */
export function seedConversationWithMessages(db: DatabaseInstance) {
  const convRepo = createConversationRepository(db);
  const msgRepo = createMessageRepository(db);
  const conv = convRepo.create({ assistantId: 'builtin-general', title: '产品讨论' });
  msgRepo.add({ conversationId: conv.id, role: 'user', content: '介绍一下产品', status: 'completed' });
  msgRepo.add({ conversationId: conv.id, role: 'assistant', content: '好的，我们的产品...', status: 'completed' });
  return conv;
}

/** 单个对话（无消息） */
export function seedConversation(db: DatabaseInstance, title: string) {
  return createConversationRepository(db).create({ assistantId: 'builtin-general', title });
}

/** 单个知识库 */
export function seedKnowledgeBase(db: DatabaseInstance, name: string) {
  return createKnowledgeRepository(db).create({ name, chunkSize: 300, chunkOverlap: 50 });
}

export interface SeedKnowledgeChunks {
  ordinal: number;
  content: string;
  charStart: number;
  charEnd: number;
  pageNo?: number | null;
  paragraphNo?: number | null;
}

export interface SeedKnowledgeOptions {
  name?: string;
  filename?: string;
  fileType?: string;
  byteSize?: number;
  contentHash?: string;
  chunks?: SeedKnowledgeChunks[];
  indexedAt?: string;
}

/** 知识库 + 文档 + 分片，并把文档置为 indexed（导出前状态），返回 kb/doc 供断言引用 */
export function seedIndexedKnowledge(db: DatabaseInstance, opts: SeedKnowledgeOptions = {}) {
  const kbRepo = createKnowledgeRepository(db);
  const docRepo = createDocumentRepository(db);
  const chunkRepo = createChunkRepository(db);
  const chunks: SeedKnowledgeChunks[] = opts.chunks ?? [
    { ordinal: 0, content: '第一行内容', charStart: 0, charEnd: 5 },
    { ordinal: 1, content: '第二行内容', charStart: 6, charEnd: 10 },
  ];
  const kb = kbRepo.create({ name: opts.name ?? '技术文档', chunkSize: 300, chunkOverlap: 50 });
  const doc = docRepo.create({
    knowledgeBaseId: kb.id,
    filename: opts.filename ?? 'readme.md',
    fileType: opts.fileType ?? 'md',
    byteSize: opts.byteSize ?? 200,
    contentHash: opts.contentHash ?? 'abc123',
    source: 'upload',
  });
  chunkRepo.bulkInsert(doc.id, chunks);
  docRepo.setStatus(doc.id, 'indexed', {
    chunkCount: chunks.length,
    indexedAt: opts.indexedAt ?? '2025-06-01T00:00:00Z',
  });
  return { kb, doc };
}

/** 明文主题设置（另一用例仅需要 theme） */
export function seedDarkThemeSetting(db: DatabaseInstance) {
  createSettingsRepository(db).setJson('theme', { mode: 'dark' });
}

/** 明文主题 + 一条加密敏感值（脱敏 roundtrip 用） */
export function seedMixedSettings(db: DatabaseInstance) {
  const settingsRepo = createSettingsRepository(db);
  settingsRepo.setJson('theme', { mode: 'dark' });
  settingsRepo.setJson('sensitive', { encrypted: true, ciphertext: 'SECRET' });
}

const PNG_HEADER = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);

/** 附件元数据 + 磁盘二进制（PNG 头 8 字节） */
export function seedAttachment(db: DatabaseInstance, dataRoot: string) {
  mkdirSync(join(dataRoot, 'attachments'), { recursive: true });
  const att = createAttachmentRepository(db).create({
    filename: 'logo.png',
    mimeType: 'image/png',
    byteSize: 10,
    contentHash: 'png-hash',
  });
  writeFileSync(join(dataRoot, 'attachments', att.storage_path), PNG_HEADER);
  return att;
}

/** skills 轨夹具：weekly-report 文件夹 + skill.json + 一条 disabled 状态行 */
export function seedSkillFixture(db: DatabaseInstance, dataRoot: string) {
  const skillsDir = join(dataRoot, 'skills');
  const manifestContent = JSON.stringify({ name: 'weekly-report', description: '周报', version: '1.0.0' });
  mkdirSync(join(skillsDir, 'weekly-report'), { recursive: true });
  writeFileSync(join(skillsDir, 'weekly-report', 'skill.json'), manifestContent);
  createSkillStateRepository(db).create({
    name: 'weekly-report',
    enabled: false,
    sourcePath: join(skillsDir, 'weekly-report'),
  });
  return { skillsDir, manifestContent };
}

/** 内存中打 tar.gz（测试构造伪归档用，逻辑同 export 的打包步骤） */
export function packGzipArchive(entries: Array<{ name: string; data: string | Buffer }>): Promise<Buffer> {
  const pack = tar.pack();
  for (const entry of entries) {
    pack.entry({ name: entry.name }, entry.data);
  }
  pack.finalize();
  return new Promise<Buffer>((resolve, reject) => {
    const chunks: Buffer[] = [];
    pack
      .pipe(zlib.createGzip())
      .on('data', (c: unknown) => chunks.push(c as Buffer))
      .on('end', () => resolve(Buffer.concat(chunks)))
      .on('error', reject);
  });
}

/** 只含 manifest.json 条目的伪归档（版本不兼容用例） */
export function packManifestArchive(manifest: unknown): Promise<Buffer> {
  return packGzipArchive([{ name: 'manifest.json', data: JSON.stringify(manifest) }]);
}
