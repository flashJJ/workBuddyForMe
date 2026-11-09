'use client';

import * as React from 'react';
import { apiUpload, ApiClientError } from '@/lib/api/client';
import { useToast } from '@/components/common/toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useI18n } from '@/lib/i18n/use-i18n';
import type { BackupTrack, BackupPrecheck, BackupVerification } from '@wbfm/shared/backup';
import type { BackupRestoreResult } from '@wbfm/core/backup';
import { BACKUP_TRACK_KEYS as TRACK_KEYS, BACKUP_TRACK_ORDER as TRACK_ORDER } from './backup-tracks';
import { BackupVerificationCard } from './backup-verification-card';
import {
  defaultRestoreTracks,
  precheckCountRows,
  summarizeRestore,
  trackCount,
} from './backup-restore-summary';

/** /api/backup/restore 成功信封解包后的 data（route 返回 jsonOk({precheck,result})） */
type RestoreResponse = { precheck: BackupPrecheck; result: BackupRestoreResult };

/**
 * v2.32：两步恢复——先只读预检（不写库），展示版本/计数/警告并勾选轨道，
 * 再确认执行恢复。版本不兼容时直接禁用确认。
 */
export function BackupRestoreSection() {
  const { t } = useI18n();
  const toast = useToast();
  const [checking, setChecking] = React.useState(false);
  const [restoring, setRestoring] = React.useState(false);
  const [file, setFile] = React.useState<File | null>(null);
  const [precheck, setPrecheck] = React.useState<BackupPrecheck | null>(null);
  const [selected, setSelected] = React.useState<BackupTrack[]>([]);
  const [password, setPassword] = React.useState('');
  const [needsPassword, setNeedsPassword] = React.useState(false);
  const [passwordError, setPasswordError] = React.useState<string | null>(null);
  // v2.33：恢复核对（声明 vs 写入/跳过 + 缺失项），成功恢复后保留展示
  const [verification, setVerification] = React.useState<BackupVerification | null>(null);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const reset = () => {
    setFile(null);
    setPrecheck(null);
    setSelected([]);
    setPassword('');
    setNeedsPassword(false);
    setPasswordError(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  /** v2.33：加密归档缺少/错误密码时不重置文件，改为就地输入密码重试预检 */
  const runPrecheck = async (next: File, pwd: string) => {
    setChecking(true);
    setFile(next);
    setPrecheck(null);
    setPasswordError(null);
    try {
      const form = new FormData();
      form.append('file', next);
      if (pwd) form.append('password', pwd);
      const result = await apiUpload<BackupPrecheck>('/api/backup/precheck', form);
      setPassword(pwd);
      setNeedsPassword(false);
      setPrecheck(result);
      setSelected(defaultRestoreTracks(result));
    } catch (error) {
      const code = error instanceof ApiClientError ? error.code : '';
      if (code === 'BACKUP_PASSWORD_REQUIRED' || code === 'BACKUP_PASSWORD_INVALID') {
        setPassword('');
        setNeedsPassword(true);
        if (code === 'BACKUP_PASSWORD_INVALID') {
          setPasswordError(t('settingsBackup.passwordInvalid'));
        }
      } else {
        toast.error(
          error instanceof ApiClientError ? error.message : t('settingsBackup.restoreFailed'),
        );
        reset();
      }
    } finally {
      setChecking(false);
    }
  };

  const doRestore = async () => {
    if (!file || !precheck?.compatible || selected.length === 0) return;
    setRestoring(true);
    try {
      const form = new FormData();
      form.append('file', file);
      form.append('tracks', JSON.stringify(selected));
      if (password) form.append('password', password);
      const response = await apiUpload<RestoreResponse>('/api/backup/restore', form);
      toast.success(summarizeRestore(response.result, t));
      setVerification(response.result.verification);
      if (response.result.imported.documents > 0) {
        toast.info(t('settingsBackup.reindexHint', { count: response.result.imported.documents }));
      }
      if (response.precheck.warnings.some((w) => w.includes('脱敏'))) {
        toast.info(t('settingsBackup.redactedHint'));
      }
      reset();
    } catch (error) {
      if (error instanceof ApiClientError && error.status === 422) {
        const details = error.details as { precheck?: BackupPrecheck } | undefined;
        if (details?.precheck?.warnings[0]) {
          toast.error(details.precheck.warnings[0]);
          return;
        }
      }
      toast.error(
        error instanceof ApiClientError ? error.message : t('settingsBackup.restoreFailed'),
      );
    } finally {
      setRestoring(false);
    }
  };

  const toggle = (track: BackupTrack) => {
    setSelected((prev) =>
      prev.includes(track) ? prev.filter((item) => item !== track) : [...prev, track],
    );
  };

  const onFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const next = event.target.files?.[0];
    setPassword('');
    setNeedsPassword(false);
    setPasswordError(null);
    if (next) void runPrecheck(next, '');
  };

  const countRows = precheck ? precheckCountRows(precheck) : [];
  const compatible = precheck?.compatible === true;

  return (
    <div className="space-y-3 rounded-md border p-3" data-testid="backup-restore">
      <Label>{t('settingsBackup.restoreTitle')}</Label>
      <input
        ref={fileInputRef}
        type="file"
        accept=".tar.gz,.tgz"
        aria-label={t('settingsBackup.chooseFileAria')}
        className="block w-full text-sm text-muted-foreground file:mr-3 file:rounded-md file:border-0 file:bg-primary file:px-3 file:py-1.5 file:text-sm file:text-primary-foreground hover:file:bg-primary/90"
        onChange={onFileChange}
        disabled={checking || restoring}
      />
      <p className="text-xs text-muted-foreground">{t('settingsBackup.restoreHint')}</p>

      {checking && (
        <p className="text-sm text-muted-foreground" role="status">
          {t('settingsBackup.precheck.checking')}
        </p>
      )}

      {needsPassword && (
        <div className="space-y-2 rounded-md border bg-muted/30 p-3" data-testid="backup-password">
          <p className="text-sm font-medium">{t('settingsBackup.encryptedArchiveTitle')}</p>
          <p className="text-xs text-muted-foreground">
            {t('settingsBackup.encryptedArchiveHint')}
          </p>
          <Input
            type="password"
            autoComplete="off"
            aria-label={t('settingsBackup.passwordInputAria')}
            placeholder={t('settingsBackup.passwordInputAria')}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            disabled={checking || restoring}
          />
          {passwordError && <p className="text-xs text-destructive">{passwordError}</p>}
          <div className="flex justify-end">
            <Button
              type="button"
              onClick={() => {
                if (file) void runPrecheck(file, password);
              }}
              disabled={checking || restoring || password.length < 8}
            >
              {t('settingsBackup.passwordSubmit')}
            </Button>
          </div>
        </div>
      )}

      {precheck && (
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

          {countRows.length > 0 ? (
            <ul className="grid gap-1 text-xs text-muted-foreground sm:grid-cols-2">
              {countRows.map((row) => (
                <li key={row.label}>{t(row.label, { count: row.count })}</li>
              ))}
            </ul>
          ) : (
            <p className="text-xs text-muted-foreground">
              {t('settingsBackup.precheck.noData')}
            </p>
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
                      onChange={() => toggle(track)}
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

          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={reset} disabled={restoring}>
              {t('settingsBackup.precheck.cancel')}
            </Button>
            <Button
              type="button"
              onClick={() => void doRestore()}
              disabled={!compatible || selected.length === 0 || restoring}
            >
              {restoring
                ? t('settingsBackup.restoring')
                : t('settingsBackup.precheck.confirm')}
            </Button>
          </div>
        </div>
      )}

      {verification && <BackupVerificationCard verification={verification} />}
    </div>
  );
}
