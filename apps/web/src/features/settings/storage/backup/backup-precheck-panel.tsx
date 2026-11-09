'use client';

import * as React from 'react';
import { Button } from '@/components/ui/button';
import { useI18n } from '@/lib/i18n/use-i18n';
import type { BackupTrack } from '@wbfm/shared/backup';
import { BACKUP_TRACK_KEYS as TRACK_KEYS, BACKUP_TRACK_ORDER as TRACK_ORDER } from './backup-tracks';
import {
  archiveChainCompatible,
  precheckCountRows,
  trackCount,
  type ArchivePrecheckEntry,
} from './backup-restore-summary';

interface BackupPrecheckPanelProps {
  entries: ArchivePrecheckEntry[];
  selected: BackupTrack[];
  restoring: boolean;
  onToggle: (track: BackupTrack) => void;
  onCancel: () => void;
  onConfirm: () => void;
}

/** v2.34：预检面板——单段展示轨道勾选，多段展示链时间线并只允许整体恢复 */
export function BackupPrecheckPanel({
  entries,
  selected,
  restoring,
  onToggle,
  onCancel,
  onConfirm,
}: BackupPrecheckPanelProps) {
  const { t } = useI18n();
  const precheck = entries[0]?.precheck;
  if (!precheck) return null;
  const compatible = archiveChainCompatible(entries);
  const multi = entries.length > 1;
  const countRows = precheckCountRows(precheck);

  return (
    <div className="space-y-3 rounded-md border bg-muted/30 p-3" data-testid="backup-precheck">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="font-medium">{t('settingsBackup.precheck.title')}</span>
        <span className="text-muted-foreground">
          {t('settingsBackup.precheck.sourceVersion', { version: precheck.sourceVersion })}
        </span>
        <span className={compatible ? 'text-emerald-600' : 'text-destructive'}>
          {compatible
            ? t('settingsBackup.precheck.compatible')
            : t('settingsBackup.precheck.incompatible')}
        </span>
      </div>

      {multi ? (
        <div className="space-y-2" data-testid="backup-chain">
          <p className="text-xs font-medium">
            {t('settingsBackup.chain.title', { count: entries.length })}
          </p>
          <ul className="space-y-1 text-xs text-muted-foreground">
            {entries.map((entry) => {
              const chain = entry.precheck.chain;
              return (
                <li key={chain.archiveId}>
                  {t('settingsBackup.chain.row', {
                    sequence: chain.sequence,
                    kind: t(
                      chain.kind === 'full'
                        ? 'settingsBackup.chain.full'
                        : 'settingsBackup.chain.incremental',
                    ),
                    time: chain.startedAt ? new Date(chain.startedAt).toLocaleString() : '—',
                  })}
                </li>
              );
            })}
          </ul>
          <p className="text-xs text-muted-foreground">{t('settingsBackup.chain.hint')}</p>
        </div>
      ) : countRows.length > 0 ? (
        <ul className="grid gap-1 text-xs text-muted-foreground sm:grid-cols-2">
          {countRows.map((row) => (
            <li key={row.label}>{t(row.label, { count: row.count })}</li>
          ))}
        </ul>
      ) : (
        <p className="text-xs text-muted-foreground">{t('settingsBackup.precheck.noData')}</p>
      )}

      {precheck.warnings.length > 0 && (
        <div className="space-y-1" data-testid="backup-precheck-warnings">
          <p className="text-xs font-medium">{t('settingsBackup.precheck.warnings')}</p>
          {precheck.warnings.map((warning) => (
            <p key={warning} className="text-xs text-destructive">
              {warning}
            </p>
          ))}
        </div>
      )}

      {!multi && (
        <div className="space-y-2">
          <p className="text-xs font-medium">{t('settingsBackup.precheck.selectTracks')}</p>
          <div className="grid gap-1 sm:grid-cols-2">
            {TRACK_ORDER.map((track) => {
              const count = trackCount(precheck, track);
              return (
                <label
                  key={track}
                  className="flex cursor-pointer items-center gap-2 text-xs text-muted-foreground"
                >
                  <input
                    type="checkbox"
                    className="h-3.5 w-3.5 rounded border-muted-foreground"
                    checked={selected.includes(track)}
                    onChange={() => onToggle(track)}
                    disabled={!compatible || restoring}
                  />
                  <span>
                    {t(TRACK_KEYS[track].label)}
                    {count > 0 ? ` · ${count}` : ''}
                  </span>
                </label>
              );
            })}
          </div>
        </div>
      )}

      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={onCancel} disabled={restoring}>
          {t('settingsBackup.precheck.cancel')}
        </Button>
        <Button
          type="button"
          onClick={onConfirm}
          disabled={!compatible || (!multi && selected.length === 0) || restoring}
        >
          {restoring
            ? t('settingsBackup.restoring')
            : multi
              ? t('settingsBackup.chain.confirm', { count: entries.length })
              : t('settingsBackup.precheck.confirm')}
        </Button>
      </div>
    </div>
  );
}
