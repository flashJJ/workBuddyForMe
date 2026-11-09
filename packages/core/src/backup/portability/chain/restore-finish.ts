/**
 * v2.34：恢复收尾与核对（从 restore.ts 迁出以满足 300 行门禁）。
 * 事务外收尾 + 声明/写入核对 + 恢复链登记，差异只告警不阻断。
 */
import type {
  BackupChainInfo,
  BackupManifest,
  BackupProgressEvent,
  BackupTrack,
  BackupVerification,
} from '@wbfm/shared/backup';
import type { DatabaseInstance } from '@wbfm/database';
import { finalizeRestore } from '../restore-finalize';
import { buildRestoreVerification } from '../restore-verification';
import type { SkillsTrackPayload } from '../restore-post-write';
import type { BackupCounts } from '../../export-types';
import { recordRestoreSegment } from './backup-registry';

export interface RestoreFinishInput {
  db: DatabaseInstance;
  manifest: BackupManifest;
  files: Map<string, Buffer>;
  binaries: Array<{ name: string; data: Buffer }>;
  tracksToRestore: BackupTrack[];
  skillsPayload: SkillsTrackPayload | null;
  imported: BackupCounts;
  skipped: BackupCounts;
  restoredVrmRefs: string[];
  chain: BackupChainInfo;
  onProgress?: (ev: BackupProgressEvent) => void;
}

/** 事务外收尾 + 核对 + 链登记；返回新增警告与核对结果 */
export function finishRestore(input: RestoreFinishInput): {
  warnings: string[];
  verification: BackupVerification;
} {
  const warnings = finalizeRestore({
    db: input.db,
    manifest: input.manifest,
    files: input.files,
    binaries: input.binaries,
    tracksToRestore: input.tracksToRestore,
    skillsPayload: input.skillsPayload,
    imported: input.imported,
    skipped: input.skipped,
    restoredVrmRefs: input.restoredVrmRefs,
    ...(input.onProgress ? { onProgress: input.onProgress } : {}),
  });

  const verification = buildRestoreVerification({
    manifest: input.manifest,
    files: input.files,
    binaries: input.binaries,
    db: input.db,
    imported: input.imported,
    skipped: input.skipped,
  });

  const declaredTotal = verification.declared.reduce((total, row) => total + row.entries, 0);
  const writtenTotal = Object.values(verification.written).reduce((total, value) => total + value, 0);
  const skippedTotal = Object.values(verification.skipped).reduce((total, value) => total + value, 0);
  verification.chain = recordRestoreSegment(input.db, input.chain, {
    declaredTotal,
    writtenTotal,
    skippedTotal,
  });

  return { warnings, verification };
}
