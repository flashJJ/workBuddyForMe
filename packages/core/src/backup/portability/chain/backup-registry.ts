/**
 * v2.34：本地备份登记（meta 表，不随任何备份轨导出）。
 * - backup.history：最近 20 次导出，供增量取基线、设置页展示；
 * - backup.restoreChain：本机已应用的恢复链，用于增量段顺序保护与链级核对。
 */
import type { DatabaseInstance } from '@wbfm/database';
import { getMeta, setMeta } from '@wbfm/database';
import { ApiError } from '@wbfm/shared/errors';
import {
  backupChainSummarySchema,
  backupHistoryEntrySchema,
  type BackupChainInfo,
  type BackupChainSegment,
  type BackupChainSummary,
  type BackupHistoryEntry,
} from '@wbfm/shared/backup';
import { MAX_BACKUP_CHAIN_SEGMENTS } from './chain-info';

const HISTORY_KEY = 'backup.history';
const RESTORE_CHAIN_KEY = 'backup.restoreChain';
const HISTORY_LIMIT = 20;

/** 读取导出历史（损坏/缺失按空数组，不阻断导出） */
export function readBackupHistory(db: DatabaseInstance): BackupHistoryEntry[] {
  const raw = getMeta(db, HISTORY_KEY);
  if (!raw) return [];
  try {
    const parsed = backupHistoryEntrySchema.array().parse(JSON.parse(raw));
    return parsed;
  } catch {
    return [];
  }
}

function writeBackupHistory(db: DatabaseInstance, entries: BackupHistoryEntry[]): void {
  setMeta(db, HISTORY_KEY, JSON.stringify(entries.slice(0, HISTORY_LIMIT)));
}

/** 追加一次导出登记（新的在前，最多 20 条） */
export function appendBackupHistory(db: DatabaseInstance, entry: BackupHistoryEntry): void {
  writeBackupHistory(db, [entry, ...readBackupHistory(db)]);
}

/** 增量导出的父段；无基线或链已达上限时拒绝 */
export function requireIncrementalParent(db: DatabaseInstance): BackupHistoryEntry {
  const tail = readBackupHistory(db)[0];
  if (!tail) {
    throw ApiError.validation('没有可用的全量基线，请先执行一次全量导出');
  }
  if (tail.sequence + 1 >= MAX_BACKUP_CHAIN_SEGMENTS) {
    throw ApiError.validation(
      `备份链已达 ${MAX_BACKUP_CHAIN_SEGMENTS} 段上限，请重新执行全量导出开启新链`,
    );
  }
  return tail;
}

/** 读取本机恢复链（损坏按 null） */
export function readRestoreChain(db: DatabaseInstance): BackupChainSummary | null {
  const raw = getMeta(db, RESTORE_CHAIN_KEY);
  if (!raw) return null;
  try {
    return backupChainSummarySchema.parse(JSON.parse(raw));
  } catch {
    return null;
  }
}

/** 增量恢复前校验前置段已应用；不满足时抛链错误码 */
export function assertIncrementalPredecessor(
  db: DatabaseInstance,
  info: BackupChainInfo,
): void {
  const state = readRestoreChain(db);
  if (!state || state.chainId !== info.chainId) {
    throw new ApiError(
      'BACKUP_CHAIN_INCOMPLETE',
      '当前设备没有该链的全量基线，请先恢复基线归档再应用增量',
    );
  }
  if (state.segments.some((segment) => segment.sequence === info.sequence)) {
    throw new ApiError(
      'BACKUP_CHAIN_MISMATCH',
      `第 ${info.sequence} 段已恢复过，请从下一段继续或重新执行全量`,
    );
  }
  const parent = state.segments.find((segment) => segment.archiveId === info.parentArchiveId);
  if (!parent) {
    throw new ApiError('BACKUP_CHAIN_INCOMPLETE', '缺少增量父段，请先恢复上一段归档');
  }
  if (parent.sequence !== info.sequence - 1) {
    throw new ApiError(
      'BACKUP_CHAIN_MISMATCH',
      `增量序号不连续：父段为第 ${parent.sequence} 段，当前为第 ${info.sequence} 段`,
    );
  }
}

function missingSequences(segments: BackupChainSegment[]): number[] {
  if (segments.length === 0) return [];
  const max = Math.max(...segments.map((segment) => segment.sequence));
  const present = new Set(segments.map((segment) => segment.sequence));
  const missing: number[] = [];
  for (let seq = 0; seq <= max; seq += 1) {
    if (!present.has(seq)) missing.push(seq);
  }
  return missing;
}

/** 记录一段已成功恢复的归档；full 会重置链 */
export function recordRestoreSegment(
  db: DatabaseInstance,
  info: BackupChainInfo,
  totals: { declaredTotal: number; writtenTotal: number; skippedTotal: number },
): BackupChainSummary {
  const previous = info.kind === 'full' ? null : readRestoreChain(db);
  const keep = previous && previous.chainId === info.chainId ? previous.segments : [];
  const segment: BackupChainSegment = {
    ...info,
    declaredTotal: totals.declaredTotal,
    writtenTotal: totals.writtenTotal,
    skippedTotal: totals.skippedTotal,
  };
  const segments = [...keep.filter((item) => item.sequence !== info.sequence), segment].sort(
    (a, b) => a.sequence - b.sequence,
  );
  const summary: BackupChainSummary = {
    chainId: info.chainId,
    segments,
    missingSequences: missingSequences(segments),
  };
  setMeta(db, RESTORE_CHAIN_KEY, JSON.stringify(summary));
  return summary;
}
