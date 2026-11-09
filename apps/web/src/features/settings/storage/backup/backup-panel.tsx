'use client';

import * as React from 'react';
import { apiGet, ApiClientError, withManagedHeaders } from '@/lib/api/client';
import { useToast } from '@/components/common/toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useI18n } from '@/lib/i18n/use-i18n';
import {
  backupExportReportSchema,
  type BackupArchiveKind,
  type BackupExportReport,
  type BackupHistoryEntry,
  type BackupTrack,
} from '@wbfm/shared/backup';
import { BACKUP_TRACK_KEYS as TRACK_KEYS, BACKUP_TRACK_ORDER as TRACK_ORDER } from './backup-tracks';
import { BackupHistoryCard } from './backup-history-card';
import { BackupRestoreSection } from './backup-restore-section';

function parseReportHeader(raw: string | null): BackupExportReport | null {
  if (!raw) return null;
  try {
    const parsed = backupExportReportSchema.safeParse(JSON.parse(decodeURIComponent(raw)));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

/** 备份面板：导出（勾选轨道）+ 恢复（v2.32 起为两步：预检确认 → 执行） */
export function BackupPanel() {
  const { t } = useI18n();
  const toast = useToast();
  const [selected, setSelected] = React.useState<BackupTrack[]>(TRACK_ORDER);
  const [exporting, setExporting] = React.useState(false);
  const [encrypt, setEncrypt] = React.useState(false);
  const [password, setPassword] = React.useState('');
  const [passwordConfirm, setPasswordConfirm] = React.useState('');
  // v2.33：导出核对报告（本次）+ v2.34 本地备份历史（meta，跨会话保留）
  const [report, setReport] = React.useState<BackupExportReport | null>(null);
  const [history, setHistory] = React.useState<BackupHistoryEntry[]>([]);
  const [mode, setMode] = React.useState<BackupArchiveKind>('full');

  const refreshHistory = React.useCallback(async () => {
    try {
      const data = await apiGet<{ history?: BackupHistoryEntry[] }>('/api/backup/last-export');
      setHistory(Array.isArray(data.history) ? data.history : []);
    } catch {
      /* 历史读取失败不阻断导出 */
    }
  }, []);

  React.useEffect(() => {
    void refreshHistory();
  }, [refreshHistory]);

  const tail = history[0];
  const incrementalAvailable = Boolean(tail && tail.sequence < 19);

  /** v2.33：密码长度与二次确认前端校验（服务端仍按 8–128 兜底） */
  const passwordError = (): string | null => {
    if (!encrypt) return null;
    if (password.length < 8) return t('settingsBackup.passwordTooShort');
    if (password.length > 128) return t('settingsBackup.passwordTooLong');
    if (password !== passwordConfirm) return t('settingsBackup.passwordMismatch');
    return null;
  };

  const toggle = (track: BackupTrack) => {
    setSelected((prev) =>
      prev.includes(track) ? prev.filter((t) => t !== track) : [...prev, track],
    );
  };

  const exportDisabled =
    selected.length === 0 || exporting || (mode === 'incremental' && !incrementalAvailable);

  const doExport = async () => {
    if (exportDisabled) return;
    const invalid = passwordError();
    if (invalid) {
      toast.error(invalid);
      return;
    }
    setExporting(true);
    try {
      const headers = new Headers(withManagedHeaders().headers);
      headers.set('content-type', 'application/json');
      const res = await fetch('/api/backup/export', {
        method: 'POST',
        headers,
        body: JSON.stringify({ tracks: selected, mode, ...(encrypt ? { password } : {}) }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new ApiClientError(
          body.error?.code ?? 'EXPORT_FAILED',
          body.error?.message ?? t('settingsBackup.exportFailedStatus', { status: res.status }),
          res.status,
        );
      }
      const nextReport = parseReportHeader(res.headers.get('x-backup-report'));
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const cd = res.headers.get('content-disposition');
      const match = cd?.match(/filename="?([^"]+)"?/);
      a.download = match?.[1] ?? 'wbfm-backup.tar.gz';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      setReport(nextReport);
      await refreshHistory();
      if (encrypt) {
        setPassword('');
        setPasswordConfirm('');
      }
      toast.success(t('settingsBackup.exported'));
    } catch (error) {
      toast.error(
        error instanceof ApiClientError ? error.message : t('settingsBackup.exportFailed'),
      );
    } finally {
      setExporting(false);
    }
  };

  return (
    <section className="space-y-4 rounded-lg border bg-card p-4" data-testid="backup-panel">
      <h3 className="font-medium">{t('settingsBackup.title')}</h3>
      <p className="text-xs text-muted-foreground">
        {t('settingsBackup.descriptionLead')}
        <code>.tar.gz</code>
        {t('settingsBackup.descriptionTail')}
      </p>

      {/* 导出区域 */}
      <div className="space-y-3 rounded-md border p-3">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-4 text-sm">
            <label className="flex cursor-pointer items-center gap-2">
              <input
                type="radio"
                name="backup-mode"
                className="h-4 w-4"
                checked={mode === 'full'}
                onChange={() => setMode('full')}
                disabled={exporting}
              />
              {t('settingsBackup.modeFull')}
            </label>
            <label
              className={
                incrementalAvailable
                  ? 'flex cursor-pointer items-center gap-2'
                  : 'flex cursor-not-allowed items-center gap-2 opacity-50'
              }
            >
              <input
                type="radio"
                name="backup-mode"
                className="h-4 w-4"
                checked={mode === 'incremental'}
                onChange={() => setMode('incremental')}
                disabled={exporting || !incrementalAvailable}
              />
              {t('settingsBackup.modeIncremental')}
            </label>
          </div>
          <p className="text-xs text-muted-foreground">
            {mode === 'incremental'
              ? t('settingsBackup.incrementalHint')
              : t('settingsBackup.fullHint')}
          </p>
          {tail && (
            <p className="text-xs text-muted-foreground">
              {t('settingsBackup.chainTail', {
                kind: t(
                  tail.kind === 'full'
                    ? 'settingsBackup.chain.full'
                    : 'settingsBackup.chain.incremental',
                ),
                sequence: tail.sequence,
                time: new Date(tail.at).toLocaleString(),
              })}
            </p>
          )}
        </div>
        <Label>{t('settingsBackup.selectTracks')}</Label>
        <div className="grid gap-2 sm:grid-cols-2">
          {TRACK_ORDER.map((track) => (
            <label
              key={track}
              className="flex cursor-pointer items-start gap-2 rounded-md p-2 text-sm hover:bg-muted/50"
            >
              <input
                type="checkbox"
                className="mt-0.5 h-4 w-4 rounded border-muted-foreground"
                checked={selected.includes(track)}
                onChange={() => toggle(track)}
              />
              <span>
                <span className="block font-medium leading-tight">
                  {t(TRACK_KEYS[track].label)}
                </span>
                <span className="block text-xs text-muted-foreground">
                  {t(TRACK_KEYS[track].desc)}
                </span>
              </span>
            </label>
          ))}
        </div>
        <div className="space-y-2 rounded-md border border-dashed p-2">
          <label className="flex cursor-pointer items-center gap-2 text-sm">
            <input
              type="checkbox"
              className="h-4 w-4 rounded border-muted-foreground"
              checked={encrypt}
              onChange={(event) => setEncrypt(event.target.checked)}
              disabled={exporting}
            />
            {t('settingsBackup.passwordToggle')}
          </label>
          {encrypt && (
            <>
              <div className="grid gap-2 sm:grid-cols-2">
                <Input
                  type="password"
                  autoComplete="new-password"
                  aria-label={t('settingsBackup.passwordLabel')}
                  placeholder={t('settingsBackup.passwordLabel')}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  disabled={exporting}
                />
                <Input
                  type="password"
                  autoComplete="new-password"
                  aria-label={t('settingsBackup.passwordConfirmLabel')}
                  placeholder={t('settingsBackup.passwordConfirmLabel')}
                  value={passwordConfirm}
                  onChange={(event) => setPasswordConfirm(event.target.value)}
                  disabled={exporting}
                />
              </div>
              <p className="text-xs text-muted-foreground">{t('settingsBackup.passwordHint')}</p>
            </>
          )}
        </div>
        <div className="flex justify-end">
          <Button type="button" onClick={() => void doExport()} disabled={exportDisabled}>
            {exporting
              ? t('settingsBackup.exporting')
              : t('settingsBackup.exportButton', { count: selected.length })}
          </Button>
        </div>
      </div>

      <BackupHistoryCard history={history} report={report} />

      <BackupRestoreSection />
    </section>
  );
}
