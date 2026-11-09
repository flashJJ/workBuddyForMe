import { backupLastExportSchema, type BackupLastExport } from '@wbfm/shared/backup';
import { readBackupHistory } from '@wbfm/core/backup';
import { defineRoute } from '@/lib/server/with-api-handler';
import { jsonOk } from '@/lib/server/api-response';

export const dynamic = 'force-dynamic';

/** GET /api/backup/last-export — 最近一次导出摘要 + 本地备份历史（meta，不随备份导出） */
export const GET = defineRoute(({ services }) => {
  const history = readBackupHistory(services.db);
  const first = history[0];
  const lastExport: BackupLastExport | null = first
    ? backupLastExportSchema.parse({
        at: first.at,
        encrypted: first.encrypted,
        totalBytes: first.totalBytes,
        trackCount: first.trackCount,
        archiveId: first.archiveId,
        kind: first.kind,
        chainId: first.chainId,
        sequence: first.sequence,
      })
    : null;
  return jsonOk({ lastExport, history });
});
