'use client';

import { useI18n } from '@/lib/i18n/use-i18n';
import type { BackupExportReport, BackupHistoryEntry } from '@wbfm/shared/backup';
import { BACKUP_TRACK_KEYS as TRACK_KEYS } from './backup-tracks';
import { formatBytes } from './backup-restore-summary';

/** v2.34：最近一次导出摘要 + 本地备份历史（meta backup.history，最多 20 段） */
export function BackupHistoryCard({
  history,
  report,
}: {
  history: BackupHistoryEntry[];
  report: BackupExportReport | null;
}) {
  const { t } = useI18n();
  if (history.length === 0 && !report) return null;
  const latest = history[0];

  return (
    <div className="space-y-1 rounded-md border bg-muted/30 p-3" data-testid="backup-export-summary">
      <p className="text-sm font-medium">{t('settingsBackup.lastExportTitle')}</p>
      {latest && (
        <p className="text-xs text-muted-foreground">
          {t('settingsBackup.lastExportSummary', {
            time: new Date(latest.at).toLocaleString(),
            size: formatBytes(latest.totalBytes),
            tracks: latest.trackCount,
          })}
          {' · '}
          {t(
            latest.kind === 'full'
              ? 'settingsBackup.chain.full'
              : 'settingsBackup.chain.incremental',
          )}
          {` #${latest.sequence}`}
          {latest.encrypted ? ` · ${t('settingsBackup.lastExportEncrypted')}` : ''}
        </p>
      )}
      {report && (
        <ul className="grid gap-1 text-xs text-muted-foreground sm:grid-cols-2">
          {report.tracks.map((row) => (
            <li key={row.track}>
              {t('settingsBackup.exportTrackRow', {
                label: t(TRACK_KEYS[row.track].label),
                entries: row.entryCount,
                size: formatBytes(row.bytes),
                ms: row.elapsedMs,
              })}
            </li>
          ))}
        </ul>
      )}
      {history.length > 1 && (
        <details className="text-xs text-muted-foreground">
          <summary className="cursor-pointer select-none">
            {t('settingsBackup.historyTitle', { count: history.length })}
          </summary>
          <ul className="mt-1 space-y-0.5">
            {history.slice(1, 10).map((entry) => (
              <li key={entry.archiveId}>
                {t('settingsBackup.historyRow', {
                  time: new Date(entry.at).toLocaleString(),
                  kind: t(
                    entry.kind === 'full'
                      ? 'settingsBackup.chain.full'
                      : 'settingsBackup.chain.incremental',
                  ),
                  sequence: entry.sequence,
                  size: formatBytes(entry.totalBytes),
                })}
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
