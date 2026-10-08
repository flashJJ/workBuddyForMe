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
} from '@wbfm/shared/backup';
import type { ServiceDeps } from '../services/deps';
import { getDataRoot } from '@wbfm/config';
import { ApiError } from '@wbfm/shared/errors';
import { restoreSettings, restoreKnowledge, restoreConversations, restoreAttachmentsMeta, restoreSkillsState, restoreTasks, type SkillStateEntry, type TaskTrackEntry } from './restore-ops';
import { ensureSeedData } from '../services/seed';

export interface BackupRestoreOptions {
  /** 指定恢复轨道；不传则恢复 manifest 中有数据的全部轨道 */
  tracks?: BackupTrack[];
  /** 外部进度回调 */
  onProgress?: (ev: BackupProgressEvent) => void;
}

export interface BackupRestoreResult {
  manifest: BackupManifest;
  imported: { conversations: number; messages: number; knowledgeBases: number; documents: number; chunks: number; settings: number; attachments: number; skills: number; tasks: number };
  skipped: { conversations: number; knowledgeBases: number; documents: number; attachments: number; skills: number; tasks: number };
}

/** 技能轨归档负载：skills_state 行 + 各技能文件夹的 skill.json 原文 */
interface SkillsTrackPayload {
  states?: SkillStateEntry[];
  skills?: Array<{ name: string; skillJson: string }>;
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
      skills: manifest.tracks.skills?.entryCount ?? 0,
      tasks: manifest.tracks.tasks?.entryCount ?? 0,
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

  // 技能轨负载在事务外解析一次：状态行进事务，文件夹落盘在事务后
  let skillsPayload: SkillsTrackPayload | null = null;
  if (tracksToRestore.includes('skills') && files.has('skills.json')) {
    try {
      skillsPayload = JSON.parse(files.get('skills.json')!.toString('utf-8')) as SkillsTrackPayload;
    } catch {
      throw new ApiError('VALIDATION_ERROR', 'skills.json 解析失败，归档可能已损坏');
    }
  }

  // --- 事务内：DB 写入 ---
  const txResult = deps.db.transaction(() => {
    const result: Omit<BackupRestoreResult, 'manifest'> = {
      imported: { conversations: 0, messages: 0, knowledgeBases: 0, documents: 0, chunks: 0, settings: 0, attachments: 0, skills: 0, tasks: 0 },
      skipped: { conversations: 0, knowledgeBases: 0, documents: 0, attachments: 0, skills: 0, tasks: 0 },
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

    if (tracksToRestore.includes('skills') && skillsPayload?.states?.length) {
      // 启停偏好按 name upsert（含内置技能）；计数不入 result，imported.skills 以文件夹落盘数为准
      restoreSkillsState(deps.db, skillsPayload.states);
    }

    if (tracksToRestore.includes('tasks') && files.has('tasks.json')) {
      let taskPayload: TaskTrackEntry[];
      try {
        taskPayload = JSON.parse(files.get('tasks.json')!.toString('utf-8')) as TaskTrackEntry[];
      } catch {
        throw new ApiError('VALIDATION_ERROR', 'tasks.json 解析失败，归档可能已损坏');
      }
      const { imported, skipped } = restoreTasks(deps.db, taskPayload);
      result.imported.tasks = imported;
      result.skipped.tasks = skipped;
      onProgress?.({ track: 'tasks', processed: imported + skipped, total: manifest.tracks.tasks?.entryCount ?? taskPayload.length });
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

  // --- 事务外：技能文件夹 skill.json 落盘（同名文件夹已存在则保留本机版本） ---
  if (tracksToRestore.includes('skills') && skillsPayload?.skills?.length) {
    const skillsDir = path.join(getDataRoot(), 'skills');
    fs.mkdirSync(skillsDir, { recursive: true });
    const total = manifest.tracks.skills?.entryCount ?? skillsPayload.skills.length;
    for (const sk of skillsPayload.skills) {
      const folder = path.join(skillsDir, sk.name);
      if (fs.existsSync(folder)) {
        // 不覆盖：避免备份旧版本回滚用户对技能的修改
        txResult.skipped.skills++;
      } else {
        fs.mkdirSync(folder, { recursive: true });
        fs.writeFileSync(path.join(folder, 'skill.json'), sk.skillJson);
        txResult.imported.skills++;
      }
      onProgress?.({ track: 'skills', processed: txResult.imported.skills + txResult.skipped.skills, total });
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
  if (files.has('skills.json') && (manifest.tracks.skills?.entryCount ?? 0) > 0) tracks.push('skills');
  if (files.has('tasks.json') && (manifest.tracks.tasks?.entryCount ?? 0) > 0) tracks.push('tasks');
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
