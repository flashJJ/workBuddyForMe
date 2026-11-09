/**
 * v2.34：备份归档链信息归一化。
 * v8 及更早归档没有 archiveId/kind 等字段，统一按「单段全量」补齐；
 * 新导出始终写入完整字段。
 */
import type { BackupChainInfo, BackupManifest } from '@wbfm/shared/backup';

/** 链长上限：达到后要求重新全量，避免无限增长 */
export const MAX_BACKUP_CHAIN_SEGMENTS = 20;

/** manifest → 链信息（旧归档按单段全量补齐） */
export function chainInfoFromManifest(manifest: BackupManifest): BackupChainInfo {
  const archiveId = manifest.archiveId ?? `legacy-${manifest.createdAt}`;
  return {
    archiveId,
    kind: manifest.kind ?? 'full',
    chainId: manifest.chainId ?? archiveId,
    sequence: manifest.sequence ?? 0,
    parentArchiveId: manifest.parentArchiveId ?? null,
    startedAt: manifest.startedAt ?? manifest.createdAt,
  };
}

/** 是否为增量归档（缺省字段按全量） */
export function isIncrementalManifest(manifest: BackupManifest): boolean {
  return (manifest.kind ?? 'full') === 'incremental';
}
