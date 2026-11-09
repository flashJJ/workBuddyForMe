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
import { BackupVerificationCard } from './backup-verification-card';
import { BackupPrecheckPanel } from './backup-precheck-panel';
import {
  archiveChainCompatible,
  defaultRestoreTracks,
  sortArchiveEntries,
  summarizeRestore,
  validateArchiveChain,
  type ArchivePrecheckEntry,
} from './backup-restore-summary';

/** /api/backup/restore 成功信封解包后的 data（route 返回 jsonOk({precheck,result})） */
type RestoreResponse = { precheck: BackupPrecheck; result: BackupRestoreResult };

/**
 * v2.32：两步恢复——先只读预检（不写库），展示版本/计数/警告并勾选轨道，
 * 再确认执行恢复。版本不兼容时直接禁用确认。
 * v2.34：支持多选归档；前端按 manifest 链信息排序并校验连续性，逐段调用恢复接口。
 */
export function BackupRestoreSection() {
  const { t } = useI18n();
  const toast = useToast();
  const [checking, setChecking] = React.useState(false);
  const [restoring, setRestoring] = React.useState(false);
  const [entries, setEntries] = React.useState<ArchivePrecheckEntry[]>([]);
  const [pendingFiles, setPendingFiles] = React.useState<File[]>([]);
  const [selected, setSelected] = React.useState<BackupTrack[]>([]);
  const [password, setPassword] = React.useState('');
  const [needsPassword, setNeedsPassword] = React.useState(false);
  const [passwordError, setPasswordError] = React.useState<string | null>(null);
  // v2.33：恢复核对（声明 vs 写入/跳过 + 缺失项），成功恢复后保留展示
  const [verification, setVerification] = React.useState<BackupVerification | null>(null);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const reset = () => {
    setEntries([]);
    setPendingFiles([]);
    setSelected([]);
    setPassword('');
    setNeedsPassword(false);
    setPasswordError(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  /** v2.33：加密归档缺少/错误密码时不重置文件，改为就地输入密码重试预检 */
  const runPrecheck = async (files: File[], pwd: string) => {
    setChecking(true);
    setPendingFiles(files);
    setEntries([]);
    setPasswordError(null);
    try {
      const results: ArchivePrecheckEntry[] = [];
      for (const next of files) {
        const form = new FormData();
        form.append('file', next);
        if (pwd) form.append('password', pwd);
        const precheck = await apiUpload<BackupPrecheck>('/api/backup/precheck', form);
        results.push({ file: next, precheck });
      }
      const sorted = sortArchiveEntries(results);
      const chainError = validateArchiveChain(sorted);
      if (chainError) {
        toast.error(t(chainError));
        return;
      }
      setPassword(pwd);
      setNeedsPassword(false);
      setEntries(sorted);
      setSelected(defaultRestoreTracks(sorted[0]!.precheck));
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
    if (entries.length === 0 || !archiveChainCompatible(entries)) return;
    if (entries.length === 1 && selected.length === 0) return;
    setRestoring(true);
    let current = 0;
    try {
      let last: BackupVerification | null = null;
      for (const entry of entries) {
        current += 1;
        const form = new FormData();
        form.append('file', entry.file);
        // 多段恢复不传 tracks：每段按自身 manifest 恢复全部可用轨道
        if (entries.length === 1) form.append('tracks', JSON.stringify(selected));
        if (password) form.append('password', password);
        const response = await apiUpload<RestoreResponse>('/api/backup/restore', form);
        last = response.result.verification;
        toast.success(
          t('settingsBackup.chain.segmentDone', { current, total: entries.length }),
        );
        if (response.result.imported.documents > 0) {
          toast.info(
            t('settingsBackup.reindexHint', { count: response.result.imported.documents }),
          );
        }
        if (response.precheck.warnings.some((w) => w.includes('脱敏'))) {
          toast.info(t('settingsBackup.redactedHint'));
        }
      }
      if (last) setVerification(last);
      reset();
    } catch (error) {
      if (error instanceof ApiClientError && error.status === 422 && current === 1) {
        const details = error.details as { precheck?: BackupPrecheck } | undefined;
        if (details?.precheck?.warnings[0]) {
          toast.error(details.precheck.warnings[0]);
          return;
        }
      }
      const reason =
        error instanceof ApiClientError ? error.message : t('settingsBackup.restoreFailed');
      toast.error(
        entries.length > 1
          ? t('settingsBackup.chain.segmentFailed', {
              current,
              total: entries.length,
              message: reason,
            })
          : reason,
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
    const files = Array.from(event.target.files ?? []);
    setPassword('');
    setNeedsPassword(false);
    setPasswordError(null);
    if (files.length > 0) void runPrecheck(files, '');
  };

  return (
    <div className="space-y-3 rounded-md border p-3" data-testid="backup-restore">
      <Label>{t('settingsBackup.restoreTitle')}</Label>
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept=".tar.gz,.tgz,.enc"
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
                if (pendingFiles.length > 0) void runPrecheck(pendingFiles, password);
              }}
              disabled={checking || restoring || password.length < 8}
            >
              {t('settingsBackup.passwordSubmit')}
            </Button>
          </div>
        </div>
      )}

      <BackupPrecheckPanel
        entries={entries}
        selected={selected}
        restoring={restoring}
        onToggle={toggle}
        onCancel={reset}
        onConfirm={() => void doRestore()}
      />

      {verification && <BackupVerificationCard verification={verification} />}
    </div>
  );
}
