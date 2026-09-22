import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import tar from 'tar-stream';
import {
  CURRENT_BACKUP_SCHEMA_VERSION,
  backupManifestSchema,
  type BackupManifest,
  type BackupProgressEvent,
  type BackupTrack,
} from '@wbfm/shared';
import type { ServiceDeps } from '../services/deps';
import {
  createConversationRepository,
  createMessageRepository,
  createKnowledgeRepository,
  createDocumentRepository,
  createChunkRepository,
  createSettingsRepository,
  createAttachmentRepository,
} from '@wbfm/database';
import { getAppVersion } from './app-version';
import { ApiError } from '@wbfm/shared';
import { getDataRoot } from '@wbfm/config';

/** 归档最大 500MB（保护用户磁盘，超限在导出前就拒绝） */
export const BACKUP_MAX_ARCHIVE_BYTES = 500 * 1024 * 1024;

export interface BackupExportOptions {
  tracks: BackupTrack[];
  /** 归档落盘路径（不传则返回 Buffer） */
  outputPath?: string;
  /** 外部进度回调（不传则静默） */
  onProgress?: (ev: BackupProgressEvent) => void;
}

export interface BackupExportResult {
  archive: Buffer;
  manifest: BackupManifest;
  /** 归档字节数 */
  size: number;
}

/** 敏感值在 settings 轨中的占位 */
const REDACTED_PLACEHOLDER = '[REDACTED]';

/**
 * 备份导出：四轨 JSON 序列化 + tar.gz 归档。
 *
 * 脱敏策略：settings_kv 中任何形如 { encrypted: true, ciphertext: string } 的 JSON 值，
 * 将 ciphertext 替换为 '[REDACTED]'（Electron safeStorage DPAPI key per-device 跨机器无法解密，
 * 用户恢复后需重新填入敏感凭证）。
 *
 * 向量不备份——knowledge 轨只存分片文本，恢复后走 ingestion pipeline 重新嵌入。
 */
export async function exportBackup(
  deps: ServiceDeps,
  options: BackupExportOptions,
): Promise<BackupExportResult> {
  const { tracks, onProgress } = options;
  const dataRoot = getDataRoot();

  // 用 repository 接口拉取数据（monorepo workspace 可直接 import database）
  const conversationsRepo = createConversationRepository(deps.db);
  const messagesRepo = createMessageRepository(deps.db);
  const knowledgeRepo = createKnowledgeRepository(deps.db);
  const documentsRepo = createDocumentRepository(deps.db);
  const chunksRepo = createChunkRepository(deps.db);
  const settingsRepo = createSettingsRepository(deps.db);
  const attachmentsRepo = createAttachmentRepository(deps.db);

  // 1. 逐轨序列化（纯 JSON，进 tar）
  const files: Record<string, string> = {};
  const manifestPartial: BackupManifest['tracks'] = {
    conversations: { files: 'conversations.json', entryCount: 0 },
    knowledge: { files: 'knowledge.json', knowledgeBaseCount: 0, documentCount: 0 },
    settings: { files: 'settings.json' },
    attachments: { files: 'attachments/', entryCount: 0, totalBytes: 0 },
  };

  if (tracks.includes('conversations')) {
    const convs = conversationsRepo.list(undefined, 10_000);
    const serialized = convs.map((conv) => ({
      conversation: conv,
      messages: messagesRepo.listByConversation(conv.id, 500),
    }));
    files['conversations.json'] = JSON.stringify(serialized, null, 2);
    manifestPartial.conversations.entryCount = convs.length;
    onProgress?.({ track: 'conversations', processed: convs.length, total: convs.length });
  }

  if (tracks.includes('knowledge')) {
    const kbs: ReturnType<typeof knowledgeRepo.list> = knowledgeRepo.list();
    const serialized = kbs.map((kb) => {
      const docs = documentsRepo.listByKnowledgeBase(kb.id);
      return {
        knowledgeBase: { id: kb.id, name: kb.name, description: kb.description, chunkSize: kb.chunkSize, chunkOverlap: kb.chunkOverlap, createdAt: kb.createdAt, updatedAt: kb.updatedAt },
        documents: docs.map((doc) => {
          const chunks = chunksRepo.listByDocument(doc.id);
          return {
            document: {
              id: doc.id,
              filename: doc.filename,
              fileType: doc.fileType,
              byteSize: doc.byteSize,
              contentHash: doc.contentHash,
              status: doc.status,
              source: doc.source,
              sourceUrl: doc.sourceUrl,
              chunkCount: doc.chunkCount,
              createdAt: doc.createdAt,
              indexedAt: doc.indexedAt,
            },
            chunks: chunks.map((c: { ordinal: number; content: string; charStart: number; charEnd: number }) => ({
              ordinal: c.ordinal,
              content: c.content,
              charStart: c.charStart,
              charEnd: c.charEnd,
            })),
          };
        }),
      };
    });
    files['knowledge.json'] = JSON.stringify(serialized, null, 2);
    manifestPartial.knowledge.knowledgeBaseCount = kbs.length;
    let docCount = 0;
    for (const kb of kbs) docCount += documentsRepo.listByKnowledgeBase(kb.id).length;
    manifestPartial.knowledge.documentCount = docCount;
    onProgress?.({ track: 'knowledge', processed: kbs.length, total: kbs.length });
  }

  if (tracks.includes('settings')) {
    const raw = settingsRepo.all();
    files['settings.json'] = JSON.stringify(sanitizeSettings(raw), null, 2);
    onProgress?.({ track: 'settings', processed: 1, total: 1 });
  }

  // 2. 附件二进制（可选，单独写入 tar 子目录）
  const attachmentsToPack: Array<{ name: string; data: Buffer }> = [];
  if (tracks.includes('attachments')) {
    const atts = attachmentsRepo.list();
    const attDir = path.join(dataRoot, 'attachments');
    let totalBytes = 0;
    for (const att of atts) {
      const filePath = path.join(attDir, att.storage_path);
      if (fs.existsSync(filePath)) {
        const buf = fs.readFileSync(filePath);
        attachmentsToPack.push({ name: `attachments/${att.storage_path}`, data: buf });
        totalBytes += buf.length;
      }
    }
    manifestPartial.attachments.entryCount = attachmentsToPack.length;
    manifestPartial.attachments.totalBytes = totalBytes;
    onProgress?.({ track: 'attachments', processed: attachmentsToPack.length, total: atts.length });
  }

  // 3. 打包成 tar.gz
  const manifest: BackupManifest = backupManifestSchema.parse({
    backupSchemaVersion: CURRENT_BACKUP_SCHEMA_VERSION,
    appVersion: getAppVersion(),
    createdAt: new Date().toISOString(),
    sourceDataRoot: dataRoot,
    tracks: manifestPartial,
  });

  const archive = await packTarGz(files, attachmentsToPack, manifest);

  if (archive.length > BACKUP_MAX_ARCHIVE_BYTES) {
    throw new ApiError(
      'VALIDATION_ERROR',
      `归档大小 ${(archive.length / 1024 / 1024).toFixed(1)}MB 超过上限 ${BACKUP_MAX_ARCHIVE_BYTES / 1024 / 1024}MB，请分批导出`,
    );
  }

  if (options.outputPath) {
    fs.mkdirSync(path.dirname(options.outputPath), { recursive: true });
    fs.writeFileSync(options.outputPath, archive);
  }

  return { archive, manifest, size: archive.length };
}

/**
 * settings_kv 脱敏：任何形如 { encrypted: true, ciphertext: string } 的 JSON 值，
 * 用 '[REDACTED]' 替换 ciphertext。递归处理嵌套结构。
 */
export function sanitizeSettings(raw: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(raw)) {
    out[key] = deepSanitize(value);
  }
  return out;
}

function deepSanitize(value: unknown): unknown {
  if (value === null || value === undefined) return value;
  if (typeof value !== 'object') return value;
  const obj = value as Record<string, unknown>;
  if (obj.encrypted === true && typeof obj.ciphertext === 'string') {
    return { ...obj, ciphertext: REDACTED_PLACEHOLDER };
  }
  if (Array.isArray(value)) return value.map(deepSanitize);
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) out[k] = deepSanitize(v);
  return out;
}

/** 内存中打包 tar.gz——所有 JSON 文件 + 可选二进制附件 */
function packTarGz(
  files: Record<string, string>,
  binaries: Array<{ name: string; data: Buffer }>,
  manifest: BackupManifest,
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    const pack = tar.pack();

    pack.on('data', (chunk: unknown) => chunks.push(chunk as Buffer));
    pack.on('error', reject);
    pack.on('end', () => {
      const gz = zlib.createGzip();
      gz.on('data', (c: unknown) => chunks.push(c as Buffer));
      gz.on('end', () => resolve(Buffer.concat(chunks)));
      gz.on('error', reject);
      pack.pipe(gz);
    });

    // 1. manifest
    pack.entry({ name: 'manifest.json' }, JSON.stringify(manifest, null, 2));
    // 2. JSON 轨道文件
    for (const [name, content] of Object.entries(files)) {
      pack.entry({ name }, content);
    }
    // 3. 二进制附件
    for (const bin of binaries) {
      pack.entry({ name: bin.name }, bin.data);
    }
    pack.finalize();
  });
}
