/**
 * v2.33：恢复核对（只读）。
 * 声明数来自归档 manifest，写入/跳过来自恢复事务计数；附件缺失与引用缺失只告警，不阻断恢复。
 *
 * 口径约定：声明与写入按「用户可见条目」对齐——
 * · conversations：会话 + 分支 + 分支事件
 * · knowledge：知识库 + 文档
 * · settings：固定 1（upsert）
 * · attachments：附件条目（不含引用行）
 * · skills：技能文件夹
 * · tasks：任务 + 协作运行 + 角色交接
 * · emotion：情绪状态
 * · events：提醒 + 触发器 + 角色卡（助手/流水/舞台等附属数据不单列）
 */
import type { DatabaseInstance } from '@wbfm/database';
import { ARTIFACT_MIME_BY_FORMAT } from '@wbfm/shared/constants';
import {
  backupVerificationSchema,
  type BackupManifest,
  type BackupTrack,
  type BackupVerification,
} from '@wbfm/shared/backup';
import type { BackupCounts } from '../export-types';

export function zeroTrackCounts(): Record<BackupTrack, number> {
  return {
    conversations: 0,
    knowledge: 0,
    settings: 0,
    attachments: 0,
    skills: 0,
    tasks: 0,
    emotion: 0,
    events: 0,
  };
}

/** manifest 声明条目（与 written/skipped 同口径） */
export function declaredTrackCounts(manifest: BackupManifest): Record<BackupTrack, number> {
  const t = manifest.tracks;
  return {
    conversations:
      t.conversations.entryCount +
      (t.conversations.branchCount ?? 0) +
      (t.conversations.branchEventCount ?? 0),
    knowledge: t.knowledge.knowledgeBaseCount + t.knowledge.documentCount,
    settings: 1,
    attachments: t.attachments.entryCount,
    skills: t.skills?.entryCount ?? 0,
    tasks:
      (t.tasks?.entryCount ?? 0) +
      (t.tasks?.agentRunCount ?? 0) +
      (t.tasks?.agentHandoffCount ?? 0),
    emotion: t.emotion?.entryCount ?? 0,
    events:
      (t.events?.scheduleCount ?? 0) +
      (t.events?.triggerCount ?? 0) +
      (t.events?.cardCount ?? 0),
  };
}

/** 恢复计数 → 每轨条目数（与 declaredTrackCounts 同口径） */
export function trackCountsFromResult(counts: BackupCounts): Record<BackupTrack, number> {
  return {
    // manifest 的 conversations.entryCount 是会话条数（消息为其内容），此处与声明同口径
    conversations: counts.conversations + counts.branches + counts.branchEvents,
    knowledge: counts.knowledgeBases + counts.documents,
    settings: counts.settings,
    attachments: counts.attachments,
    skills: counts.skills,
    tasks: counts.tasks + counts.agentRuns + counts.agentHandoffs,
    emotion: counts.emotion,
    events: counts.events + counts.cards,
  };
}

/** manifest 登记的附件 storagePath 中，归档内没有二进制的项 */
export function missingAttachmentFiles(
  files: Map<string, Buffer>,
  binaries: Array<{ name: string }>,
): string[] {
  const raw = files.get('attachments.json');
  if (!raw) return [];
  let rows: unknown;
  try {
    rows = JSON.parse(raw.toString('utf-8'));
  } catch {
    return [];
  }
  if (!Array.isArray(rows)) return [];
  const present = new Set(binaries.map((bin) => bin.name.replace(/^attachments\//, '')));
  const missing: string[] = [];
  for (const row of rows) {
    if (!row || typeof row !== 'object') continue;
    const storagePath = (row as { storagePath?: unknown }).storagePath;
    if (typeof storagePath === 'string' && !present.has(storagePath)) missing.push(storagePath);
  }
  return missing;
}

/** 恢复后仍无引用的非产物附件数（产物行有 artifact 引用，此处兜底排除产物 MIME） */
export function countUnreferencedAttachments(db: DatabaseInstance): number {
  const artifactMimes = Object.values(ARTIFACT_MIME_BY_FORMAT);
  const placeholders = artifactMimes.map(() => '?').join(', ');
  try {
    const row = db
      .prepare(
        `SELECT COUNT(*) AS count FROM attachments a
         WHERE NOT EXISTS (SELECT 1 FROM attachment_refs r WHERE r.attachment_id = a.id)
           AND a.mime_type NOT IN (${placeholders})`,
      )
      .get(...artifactMimes) as { count: number } | undefined;
    return row?.count ?? 0;
  } catch {
    // 旧库（未跑迁移）没有 attachment_refs：核对降级为 0，不影响恢复
    return 0;
  }
}

function declaredRows(manifest: BackupManifest): Array<{ track: BackupTrack; entries: number }> {
  const counts = declaredTrackCounts(manifest);
  return (Object.entries(counts) as Array<[BackupTrack, number]>).map(([track, entries]) => ({
    track,
    entries,
  }));
}

/** 预检核对：写入/跳过未知（0），但附件缺失可提前暴露 */
export function buildPrecheckVerification(
  manifest: BackupManifest,
  files: Map<string, Buffer>,
  binaries: Array<{ name: string }>,
): BackupVerification {
  return backupVerificationSchema.parse({
    declared: declaredRows(manifest),
    written: zeroTrackCounts(),
    skipped: zeroTrackCounts(),
    missingAttachments: missingAttachmentFiles(files, binaries),
    unreferencedAttachments: 0,
  });
}

export interface RestoreVerificationInput {
  manifest: BackupManifest;
  files: Map<string, Buffer>;
  binaries: Array<{ name: string }>;
  db: DatabaseInstance;
  imported: BackupCounts;
  skipped: BackupCounts;
}

/** 恢复核对：声明 vs 实际写入/跳过 + 附件缺失 + 未引用计数 */
export function buildRestoreVerification(input: RestoreVerificationInput): BackupVerification {
  return backupVerificationSchema.parse({
    declared: declaredRows(input.manifest),
    written: trackCountsFromResult(input.imported),
    skipped: trackCountsFromResult(input.skipped),
    missingAttachments: missingAttachmentFiles(input.files, input.binaries),
    unreferencedAttachments: countUnreferencedAttachments(input.db),
  });
}
