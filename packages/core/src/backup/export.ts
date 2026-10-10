import fs from 'node:fs';
import path from 'node:path';
import {
  CURRENT_BACKUP_SCHEMA_VERSION,
  backupManifestSchema,
  type BackupManifest,
} from '@wbfm/shared/backup';
import type { ServiceDeps } from '../services/deps';
import {
  createConversationRepository,
  createMessageRepository,
  createKnowledgeRepository,
  createDocumentRepository,
  createChunkRepository,
  createSettingsRepository,
  createAttachmentRepository,
  createSkillStateRepository,
} from '@wbfm/database';
import { serializeTasksTrack } from './export-tasks-track';
import { getAppVersion } from './app-version';
import { ApiError } from '@wbfm/shared/errors';
import { getDataRoot } from '@wbfm/config';
import { packTarGz } from './export-archive';
import { sanitizeSettings } from './export-sanitize';
import { BACKUP_MAX_ARCHIVE_BYTES } from './export-types';
import type { BackupExportOptions, BackupExportResult } from './export-types';

// 既有域 barrel 导出名原位保留（实现已拆至 kebab-case 纯函数模块，exportBackup 主流程不变）
export { sanitizeSettings };
export { BACKUP_MAX_ARCHIVE_BYTES, type BackupExportOptions, type BackupExportResult };

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
  const skillStateRepo = createSkillStateRepository(deps.db);

  // 1. 逐轨序列化（纯 JSON，进 tar）
  const files: Record<string, string> = {};
  const manifestPartial: BackupManifest['tracks'] = {
    conversations: { files: 'conversations.json', entryCount: 0 },
    knowledge: { files: 'knowledge.json', knowledgeBaseCount: 0, documentCount: 0 },
    settings: { files: 'settings.json' },
    attachments: { files: 'attachments/', entryCount: 0, totalBytes: 0 },
    skills: { files: 'skills.json', entryCount: 0 },
    tasks: { files: 'tasks.json', entryCount: 0 },
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
        knowledgeBase: { id: kb.id, name: kb.name, description: kb.description ?? '', chunkSize: kb.chunkSize, chunkOverlap: kb.chunkOverlap, createdAt: kb.createdAt, updatedAt: kb.updatedAt },
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
            chunks: chunks.map((c: { ordinal: number; content: string; charStart: number; charEnd: number; pageNo?: number | null; paragraphNo?: number | null }) => ({
              ordinal: c.ordinal,
              content: c.content,
              charStart: c.charStart,
              charEnd: c.charEnd,
              pageNo: c.pageNo ?? null,
              paragraphNo: c.paragraphNo ?? null,
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

  if (tracks.includes('skills')) {
    // v0.6 M3：技能轨——skills/ 下各文件夹的 skill.json 原文 + skills_state 启停状态
    const skillsDir = path.join(dataRoot, 'skills');
    const skills: Array<{ name: string; skillJson: string }> = [];
    if (fs.existsSync(skillsDir)) {
      for (const entry of fs.readdirSync(skillsDir, { withFileTypes: true })) {
        if (!entry.isDirectory()) continue;
        const manifestPath = path.join(skillsDir, entry.name, 'skill.json');
        if (fs.existsSync(manifestPath)) {
          skills.push({ name: entry.name, skillJson: fs.readFileSync(manifestPath, 'utf-8') });
        }
      }
    }
    files['skills.json'] = JSON.stringify({ states: skillStateRepo.list(), skills }, null, 2);
    manifestPartial.skills = { files: 'skills.json', entryCount: skills.length };
    onProgress?.({ track: 'skills', processed: skills.length, total: skills.length });
  }

  if (tracks.includes('tasks')) {
    // v0.7 M4：任务轨——task_runs + task_steps 全量序列化（截图附件 id 引用 attachments 表，独立于 attachments 轨）
    const serialized = serializeTasksTrack(deps.db);
    files['tasks.json'] = JSON.stringify(serialized, null, 2);
    manifestPartial.tasks = { files: 'tasks.json', entryCount: serialized.length };
    onProgress?.({ track: 'tasks', processed: serialized.length, total: serialized.length });
  }

  // 2. 附件：元数据 JSON + 二进制（可选）
  const attachmentsToPack: Array<{ name: string; data: Buffer }> = [];
  if (tracks.includes('attachments')) {
    const atts = attachmentsRepo.list();
    const attDir = path.join(dataRoot, 'attachments');
    let totalBytes = 0;
    const serializedAtts = [];
    for (const att of atts) {
      serializedAtts.push({
        id: att.id,
        filename: att.filename,
        mimeType: att.mime_type,
        byteSize: att.byte_size,
        storagePath: att.storage_path,
        contentHash: att.content_hash,
        createdAt: att.created_at,
      });
      const filePath = path.join(attDir, att.storage_path);
      if (fs.existsSync(filePath)) {
        const buf = fs.readFileSync(filePath);
        attachmentsToPack.push({ name: `attachments/${att.storage_path}`, data: buf });
        totalBytes += buf.length;
      }
    }
    files['attachments.json'] = JSON.stringify(serializedAtts, null, 2);
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
