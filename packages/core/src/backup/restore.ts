import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import tar from 'tar-stream';
import {
  CURRENT_BACKUP_SCHEMA_VERSION,
  backupManifestSchema,
  backupPrecheckSchema,
  type BackupManifest,
  type BackupPrecheck,
  type BackupTrack,
  type BackupProgressEvent,
} from '@wbfm/shared';
import type { ServiceDeps } from '../services/deps';
import { getDataRoot } from '@wbfm/config';
import { ApiError } from '@wbfm/shared';
import { restoreSettings, restoreKnowledge, restoreConversations, restoreAttachmentsMeta } from './restore-ops';
import { ensureSeedData } from '../services/seed';

export interface BackupRestoreOptions {
  /** 指定恢复轨道；不传则恢复 manifest 中有数据的全部轨道 */
  tracks?: BackupTrack[];
  /** 外部进度回调 */
  onProgress?: (ev: BackupProgressEvent) => void;
}

export interface BackupRestoreResult {
  manifest: BackupManifest;
  imported: { conversations: number; messages: number; knowledgeBases: number; documents: number; chunks: number; settings: number; attachments: number };
  skipped: { conversations: number; knowledgeBases: number; documents: number; attachments: number };
}

/**
 * 预检查：先于正式恢复调用，告知兼容性与将导入多少条目。
 * 版本不兼容时 compatible=false；settings 有 [REDACTED] 值时 warnings 提示敏感字段需重填。
 */
export async function precheckBackup(archiveBuffer: Buffer): Promise<BackupPrecheck> {
  const { manifest, files } = await extractArchive(archiveBuffer);
  const warnings: string[] = [];

  if (manifest.backupSchemaVersion > CURRENT_BACKUP_SCHEMA_VERSION) {
    warnings.push(`备份 schema 版本 ${manifest.backupSchemaVersion} 高于当前支持的 ${CURRENT_BACKUP_SCHEMA_VERSION}，请升级应用后再恢复`);
  }

  if (files.has('settings.json')) {
    try {
      const parsed = JSON.parse(files.get('settings.json')!.toString('utf-8'));
      if (hasRedactedPlaceholder(parsed)) warnings.push('检测到敏感字段已被脱敏（[REDACTED]），恢复后需手动重新填写凭证');
    } catch { /* settings 可能为空 */ }
  }

  return backupPrecheckSchema.parse({
    compatible: manifest.backupSchemaVersion <= CURRENT_BACKUP_SCHEMA_VERSION,
    sourceVersion: manifest.appVersion,
    tracks: {
      conversations: manifest.tracks.conversations.entryCount,
      knowledgeBases: manifest.tracks.knowledge.knowledgeBaseCount,
      documents: manifest.tracks.knowledge.documentCount,
      attachments: manifest.tracks.attachments.entryCount,
    },
    warnings,
  });
}

/** 正式恢复：事务包裹 DB 写入，附件二进制在事务外落盘 */
export async function restoreBackup(
  deps: ServiceDeps,
  archiveBuffer: Buffer,
  options: BackupRestoreOptions = {},
): Promise<BackupRestoreResult> {
  const { manifest, files, binaries } = await extractArchiveFull(archiveBuffer);

  if (manifest.backupSchemaVersion > CURRENT_BACKUP_SCHEMA_VERSION) {
    throw new ApiError('VALIDATION_ERROR', `备份 schema 版本 ${manifest.backupSchemaVersion} 高于当前支持的 ${CURRENT_BACKUP_SCHEMA_VERSION}，请升级应用后再恢复`);
  }

  // 恢复前先确保目标库有内置助手（conversations 依赖 assistants 的 FK）
  ensureSeedData(deps.db);

  const { tracks, onProgress } = options;
  const tracksToRestore = tracks ?? determineTracks(manifest, files);

  // --- 事务内：DB 写入 ---
  const txResult = deps.db.transaction(() => {
    const result: Omit<BackupRestoreResult, 'manifest'> = {
      imported: { conversations: 0, messages: 0, knowledgeBases: 0, documents: 0, chunks: 0, settings: 0, attachments: 0 },
      skipped: { conversations: 0, knowledgeBases: 0, documents: 0, attachments: 0 },
    };

    if (tracksToRestore.includes('settings') && files.has('settings.json')) {
      restoreSettings(deps.db, files.get('settings.json')!);
      result.imported.settings = 1;
      onProgress?.({ track: 'settings', processed: 1, total: 1 });
    }

    if (tracksToRestore.includes('knowledge') && files.has('knowledge.json')) {
      const { kb, doc, chunk } = restoreKnowledge(deps.db, files.get('knowledge.json')!);
      result.imported.knowledgeBases = kb.imported; result.skipped.knowledgeBases = kb.skipped;
      result.imported.documents = doc.imported; result.skipped.documents = doc.skipped;
      result.imported.chunks = chunk;
      onProgress?.({ track: 'knowledge', processed: kb.imported + doc.imported, total: manifest.tracks.knowledge.knowledgeBaseCount + manifest.tracks.knowledge.documentCount });
    }

    if (tracksToRestore.includes('conversations') && files.has('conversations.json')) {
      const { convs, msgs } = restoreConversations(deps.db, files.get('conversations.json')!);
      result.imported.conversations = convs.imported; result.skipped.conversations = convs.skipped;
      result.imported.messages = msgs;
      onProgress?.({ track: 'conversations', processed: convs.imported, total: manifest.tracks.conversations.entryCount });
    }

    if (tracksToRestore.includes('attachments') && files.has('attachments.json')) {
      const { imported, skipped } = restoreAttachmentsMeta(deps.db, files.get('attachments.json')!);
      result.imported.attachments = imported; result.skipped.attachments = skipped;
      onProgress?.({ track: 'attachments', processed: imported, total: manifest.tracks.attachments.entryCount });
    }

    return result;
  }).immediate();

  // --- 事务外：附件二进制落盘 ---
  if (tracksToRestore.includes('attachments') && binaries.length > 0) {
    const attDir = path.join(getDataRoot(), 'attachments');
    fs.mkdirSync(attDir, { recursive: true });
    for (const bin of binaries) {
      const destPath = path.join(attDir, bin.name.replace(/^attachments\//, ''));
      fs.writeFileSync(destPath, bin.data);
    }
  }

  return { manifest, ...txResult };
}

// ==================== 辅助函数 ====================

function determineTracks(manifest: BackupManifest, files: Map<string, Buffer>): BackupTrack[] {
  const tracks: BackupTrack[] = [];
  if (files.has('conversations.json') && manifest.tracks.conversations.entryCount > 0) tracks.push('conversations');
  if (files.has('knowledge.json') && manifest.tracks.knowledge.knowledgeBaseCount > 0) tracks.push('knowledge');
  if (files.has('settings.json')) tracks.push('settings');
  if (files.has('attachments.json') && manifest.tracks.attachments.entryCount > 0) tracks.push('attachments');
  return tracks;
}

function hasRedactedPlaceholder(value: unknown): boolean {
  if (value === '[REDACTED]') return true;
  if (value === null || value === undefined || typeof value !== 'object') return false;
  if (Array.isArray(value)) return value.some(hasRedactedPlaceholder);
  return Object.values(value as Record<string, unknown>).some(hasRedactedPlaceholder);
}

async function extractArchive(buf: Buffer): Promise<{ manifest: BackupManifest; files: Map<string, Buffer> }> {
  const r = await extractArchiveFull(buf);
  return { manifest: r.manifest, files: r.files };
}

async function extractArchiveFull(buf: Buffer): Promise<{
  manifest: BackupManifest;
  files: Map<string, Buffer>;
  binaries: Array<{ name: string; data: Buffer }>;
}> {
  return new Promise((resolve, reject) => {
    const gunzip = zlib.createGunzip();
    const extract = tar.extract();
    const files = new Map<string, Buffer>();
    const binaries: Array<{ name: string; data: Buffer }> = [];
    let manifest: BackupManifest | null = null;

    extract.on('entry', (header, stream, next) => {
      const chunks: Buffer[] = [];
      stream.on('data', (c: unknown) => chunks.push(c as Buffer));
      stream.on('end', () => {
        const full = Buffer.concat(chunks);
        if (header.name === 'manifest.json') {
          try { manifest = backupManifestSchema.parse(JSON.parse(full.toString('utf-8'))); }
          catch { reject(new ApiError('VALIDATION_ERROR', 'manifest.json schema 校验失败')); return; }
        } else if (header.name.startsWith('attachments/')) {
          binaries.push({ name: header.name, data: full });
        } else {
          files.set(header.name, full);
        }
        next();
      });
      stream.on('error', reject);
    });

    extract.on('finish', () => {
      if (!manifest) { reject(new ApiError('VALIDATION_ERROR', '归档缺少 manifest.json')); return; }
      resolve({ manifest, files, binaries });
    });
    gunzip.on('error', reject); extract.on('error', reject);
    gunzip.pipe(extract); gunzip.end(buf);
  });
}
