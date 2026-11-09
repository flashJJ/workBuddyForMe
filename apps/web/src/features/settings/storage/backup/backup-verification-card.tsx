'use client';

import * as React from 'react';
import { Button } from '@/components/ui/button';
import { useI18n } from '@/lib/i18n/use-i18n';
import type { BackupVerification } from '@wbfm/shared/backup';
import { BACKUP_TRACK_KEYS as TRACK_KEYS } from './backup-tracks';

/**
 * v2.33：恢复核对卡片——逐轨「声明 / 写入 / 跳过」，并列出归档缺失附件与未引用附件。
 * 差异只提示，不阻断恢复。
 */
export function BackupVerificationCard({ verification }: { verification: BackupVerification }) {
  const { t } = useI18n();
  const [dismissed, setDismissed] = React.useState(false);
  // 连续多次恢复时重新展开（verification 为每次恢复的新对象）
  React.useEffect(() => setDismissed(false), [verification]);
  if (dismissed) return null;

  return (
    <div className="space-y-2 rounded-md border bg-muted/30 p-3" data-testid="backup-verification">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-medium">{t('settingsBackup.verification.title')}</p>
        <Button type="button" variant="outline" onClick={() => setDismissed(true)}>
          {t('settingsBackup.verification.dismiss')}
        </Button>
      </div>
      <ul className="grid gap-1 text-xs text-muted-foreground sm:grid-cols-2">
        {verification.declared
          .filter((row) => row.entries > 0)
          .map((row) => (
            <li key={row.track}>
              {t('settingsBackup.verification.row', {
                label: t(TRACK_KEYS[row.track].label),
                declared: row.entries,
                written: verification.written[row.track],
                skipped: verification.skipped[row.track],
              })}
            </li>
          ))}
      </ul>
      {verification.missingAttachments.length > 0 && (
        <p className="text-xs text-destructive">
          {t('settingsBackup.verification.missing', {
            count: verification.missingAttachments.length,
            names: verification.missingAttachments.join('、'),
          })}
        </p>
      )}
      {verification.unreferencedAttachments > 0 && (
        <p className="text-xs text-muted-foreground">
          {t('settingsBackup.verification.unreferenced', {
            count: verification.unreferencedAttachments,
          })}
        </p>
      )}
    </div>
  );
}
