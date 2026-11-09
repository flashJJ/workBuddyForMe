/**
 * v2.32：恢复事务外的落盘副作用。
 * 与 restore.ts 分离以通过 300 行门禁；DB 写入仍由 restore.ts 的事务包裹。
 */
import fs from 'node:fs';
import path from 'node:path';
import type { BackupProgressEvent } from '@wbfm/shared/backup';
import { getDataRoot } from '@wbfm/config';
import { createScheduledTaskRepository } from '@wbfm/database';
import { computeNextRunMs } from '../../scheduler/next-run';
import type { SkillStateEntry } from '../restore-ops';

/** 技能轨归档负载：skills_state 行 + 各技能文件夹的 skill.json 原文 */
export interface SkillsTrackPayload {
  states?: SkillStateEntry[];
  skills?: Array<{ name: string; skillJson: string }>;
}

/** 附件二进制落盘（事务外，失败不回滚 DB 元数据） */
export function writeAttachmentBinaries(binaries: Array<{ name: string; data: Buffer }>): void {
  const attDir = path.join(getDataRoot(), 'attachments');
  fs.mkdirSync(attDir, { recursive: true });
  for (const bin of binaries) {
    const destPath = path.join(attDir, bin.name.replace(/^attachments\//, ''));
    fs.writeFileSync(destPath, bin.data);
  }
}

/** 技能文件夹落盘：同名文件夹已存在则保留本机版本，不覆盖 */
export function writeSkillFolders(
  payload: SkillsTrackPayload,
  total: number,
  onProgress?: (ev: BackupProgressEvent) => void,
): { imported: number; skipped: number } {
  let imported = 0;
  let skipped = 0;
  const skillsDir = path.join(getDataRoot(), 'skills');
  fs.mkdirSync(skillsDir, { recursive: true });
  for (const sk of payload.skills ?? []) {
    const folder = path.join(skillsDir, sk.name);
    if (fs.existsSync(folder)) {
      // 不覆盖：避免备份旧版本回滚用户对技能的修改
      skipped++;
    } else {
      fs.mkdirSync(folder, { recursive: true });
      fs.writeFileSync(path.join(folder, 'skill.json'), sk.skillJson);
      imported++;
    }
    onProgress?.({ track: 'skills', processed: imported + skipped, total });
  }
  return { imported, skipped };
}

/** events 轨恢复后统一重排启用提醒（防备份时刻过期/未来漂移） */
export function recomputeEnabledSchedules(db: any): void {
  try {
    createScheduledTaskRepository(db, { computeNextRunMs }).recomputeEnabled();
  } catch (error) {
    // 重排失败不判定恢复失败：提醒行已入库，下条编辑/tick 会自然纠偏
    console.warn('[backup] 提醒时刻重排失败', error);
  }
}
