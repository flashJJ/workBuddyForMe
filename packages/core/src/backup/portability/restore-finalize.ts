/**
 * v2.33：恢复事务外收尾（从 restore.ts 迁出以满足 300 行门禁）。
 * 顺序：旧档提示词迁移 → 附件二进制落盘 → 旧归档引用回填 → 技能文件夹落盘 →
 * 提醒时刻重排 → VRM 悬空提示。全部为幂等/只告警操作，失败不改变已提交的 DB 写入。
 */
import type { BackupManifest, BackupProgressEvent, BackupTrack } from '@wbfm/shared/backup';
import type { ServiceDeps } from '../../services/base/deps';
import { migrateLegacySystemPrompts } from '../../services/base/seed';
import { backfillAttachmentRefs } from '../../services/assistant/attachment-refs-backfill';
import {
  recomputeEnabledSchedules,
  writeAttachmentBinaries,
  writeSkillFolders,
  type SkillsTrackPayload,
} from './restore-post-write';
import type { BackupCounts } from '../export-types';

export interface RestoreFinalizeInput {
  db: ServiceDeps['db'];
  manifest: BackupManifest;
  files: Map<string, Buffer>;
  binaries: Array<{ name: string; data: Buffer }>;
  tracksToRestore: BackupTrack[];
  skillsPayload: SkillsTrackPayload | null;
  imported: BackupCounts;
  skipped: BackupCounts;
  restoredVrmRefs: string[];
  onProgress?: (ev: BackupProgressEvent) => void;
}

/** 事务外收尾；返回新增的非致命提醒（调用方并入 warnings） */
export function finalizeRestore(input: RestoreFinalizeInput): string[] {
  const warnings: string[] = [];

  // v1.8：旧档（无 card_id 的助手行）恢复后补跑提示词迁移；已选卡助手天然跳过
  migrateLegacySystemPrompts(input.db, { force: true });

  // --- 事务外：附件二进制落盘 ---
  if (input.tracksToRestore.includes('attachments') && input.binaries.length > 0) {
    writeAttachmentBinaries(input.binaries);
  }

  // v2.33：旧归档缺 refs.json 时按现有消息与产物立即回填（幂等）
  if (
    input.tracksToRestore.includes('attachments') &&
    input.files.has('attachments.json') &&
    !input.files.has('refs.json')
  ) {
    try {
      const backfill = backfillAttachmentRefs(input.db, { force: true });
      if (backfill.inserted > 0) {
        warnings.push(`旧归档未含引用清单，已按现有消息与产物回填 ${backfill.inserted} 条附件引用`);
      }
    } catch (error) {
      warnings.push(`旧归档附件引用回填失败：${error instanceof Error ? error.message : String(error)}`);
    }
  }

  // --- 事务外：技能文件夹 skill.json 落盘（同名文件夹已存在则保留本机版本） ---
  if (input.tracksToRestore.includes('skills') && input.skillsPayload?.skills?.length) {
    const total = input.manifest.tracks.skills?.entryCount ?? input.skillsPayload.skills.length;
    const counts = writeSkillFolders(input.skillsPayload, total, input.onProgress);
    input.imported.skills += counts.imported;
    input.skipped.skills += counts.skipped;
  }

  // --- 事务外：events 轨恢复后统一重排启用提醒（防备份时刻过期/未来漂移） ---
  if (input.tracksToRestore.includes('events') && input.files.has('events.json')) {
    recomputeEnabledSchedules(input.db);
  }

  // --- v2.0 M5：VRM 引用悬空提示（二进制按红线从不入备份） ---
  if (input.restoredVrmRefs.length > 0) {
    warnings.push(
      `已恢复 ${input.restoredVrmRefs.length} 个 VRM 形象引用（${input.restoredVrmRefs.join('、')}），但 .vrm 模型文件不随备份携带；请重新导入对应模型文件后形象才能上舞台`,
    );
  }

  return warnings;
}
