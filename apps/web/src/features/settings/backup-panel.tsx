'use client';

import * as React from 'react';
import type { MessageKey } from '@wbfm/shared/i18n';
import { apiUpload, ApiClientError, withManagedHeaders } from '@/lib/api/client';
import { useToast } from '@/components/common/toast';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { useI18n } from '@/lib/i18n/use-i18n';
import type { BackupTrack, BackupPrecheck } from '@wbfm/shared/backup';
import type { BackupRestoreResult } from '@wbfm/core/backup';

/** 轨道展示键（顺序即 UI 展示顺序） */
const TRACK_KEYS: Record<BackupTrack, { label: MessageKey; desc: MessageKey }> = {
  conversations: {
    label: 'settingsBackup.tracks.conversationsLabel',
    desc: 'settingsBackup.tracks.conversationsDesc',
  },
  knowledge: {
    label: 'settingsBackup.tracks.knowledgeLabel',
    desc: 'settingsBackup.tracks.knowledgeDesc',
  },
  settings: {
    label: 'settingsBackup.tracks.settingsLabel',
    desc: 'settingsBackup.tracks.settingsDesc',
  },
  attachments: {
    label: 'settingsBackup.tracks.attachmentsLabel',
    desc: 'settingsBackup.tracks.attachmentsDesc',
  },
  skills: {
    label: 'settingsBackup.tracks.skillsLabel',
    desc: 'settingsBackup.tracks.skillsDesc',
  },
  tasks: {
    label: 'settingsBackup.tracks.tasksLabel',
    desc: 'settingsBackup.tracks.tasksDesc',
  },
};

const TRACK_ORDER: BackupTrack[] = [
  'conversations',
  'knowledge',
  'settings',
  'attachments',
  'skills',
  'tasks',
];

type RestoreResponse = { ok: true; precheck: BackupPrecheck; result: BackupRestoreResult };

export function BackupPanel() {
  const { t } = useI18n();
  const toast = useToast();
  const [selected, setSelected] = React.useState<BackupTrack[]>(TRACK_ORDER);
  const [exporting, setExporting] = React.useState(false);
  const [restoring, setRestoring] = React.useState(false);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const toggle = (track: BackupTrack) => {
    setSelected((prev) =>
      prev.includes(track) ? prev.filter((t) => t !== track) : [...prev, track],
    );
  };

  const exportDisabled = selected.length === 0 || exporting;

  const doExport = async () => {
    if (exportDisabled) return;
    setExporting(true);
    try {
      const headers = new Headers(withManagedHeaders().headers);
      headers.set('content-type', 'application/json');
      const res = await fetch('/api/backup/export', {
        method: 'POST',
        headers,
        body: JSON.stringify({ tracks: selected }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new ApiClientError(
          body.error?.code ?? 'EXPORT_FAILED',
          body.error?.message ?? t('settingsBackup.exportFailedStatus', { status: res.status }),
          res.status,
        );
      }
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
      toast.success(t('settingsBackup.exported'));
    } catch (error) {
      toast.error(
        error instanceof ApiClientError ? error.message : t('settingsBackup.exportFailed'),
      );
    } finally {
      setExporting(false);
    }
  };

  const handleFile = async (file: File) => {
    setRestoring(true);
    try {
      const form = new FormData();
      form.append('file', file);
      const resp = await apiUpload<RestoreResponse>('/api/backup/restore', form);

      const r = resp.result;
      const parts: string[] = [];
      if (r.imported.conversations) {
        parts.push(t('settingsBackup.imported.conversations', { count: r.imported.conversations }));
      }
      if (r.imported.messages) {
        parts.push(t('settingsBackup.imported.messages', { count: r.imported.messages }));
      }
      if (r.imported.knowledgeBases) {
        parts.push(
          t('settingsBackup.imported.knowledgeBases', { count: r.imported.knowledgeBases }),
        );
      }
      if (r.imported.documents) {
        parts.push(t('settingsBackup.imported.documents', { count: r.imported.documents }));
      }
      if (r.imported.settings) parts.push(t('settingsBackup.imported.settings'));
      if (r.imported.attachments) {
        parts.push(t('settingsBackup.imported.attachments', { count: r.imported.attachments }));
      }
      if (r.imported.skills) {
        parts.push(t('settingsBackup.imported.skills', { count: r.imported.skills }));
      }
      if (r.imported.tasks) {
        parts.push(t('settingsBackup.imported.tasks', { count: r.imported.tasks }));
      }

      const skippedParts: string[] = [];
      if (r.skipped.conversations) {
        skippedParts.push(
          t('settingsBackup.skipped.conversations', { count: r.skipped.conversations }),
        );
      }
      if (r.skipped.documents) {
        skippedParts.push(t('settingsBackup.skipped.documents', { count: r.skipped.documents }));
      }
      if (r.skipped.skills) {
        skippedParts.push(t('settingsBackup.skipped.skills', { count: r.skipped.skills }));
      }
      if (r.skipped.tasks) {
        skippedParts.push(t('settingsBackup.skipped.tasks', { count: r.skipped.tasks }));
      }

      let msg = t('settingsBackup.restoreDone', {
        items: parts.join('、') || t('common.words.none'),
      });
      if (skippedParts.length) {
        msg += t('settingsBackup.restoreSkipped', { items: skippedParts.join('、') });
      }

      toast.success(msg);

      // needs_reindex 提示
      if (r.imported.documents > 0) {
        toast.info(t('settingsBackup.reindexHint', { count: r.imported.documents }));
      }

      // 脱敏警告
      if (resp.precheck.warnings.some((w) => w.includes('脱敏'))) {
        toast.info(t('settingsBackup.redactedHint'));
      }
    } catch (error) {
      if (error instanceof ApiClientError && error.status === 422) {
        const details = error.details as { precheck?: BackupPrecheck } | undefined;
        if (details?.precheck?.warnings[0]) {
          toast.error(details.precheck.warnings[0]);
        }
      } else {
        toast.error(
          error instanceof ApiClientError ? error.message : t('settingsBackup.restoreFailed'),
        );
      }
    } finally {
      setRestoring(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) void handleFile(file);
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
        <div className="flex justify-end">
          <Button type="button" onClick={() => void doExport()} disabled={exportDisabled}>
            {exporting
              ? t('settingsBackup.exporting')
              : t('settingsBackup.exportButton', { count: selected.length })}
          </Button>
        </div>
      </div>

      {/* 恢复区域 */}
      <div className="space-y-3 rounded-md border p-3">
        <Label>{t('settingsBackup.restoreTitle')}</Label>
        <input
          ref={fileInputRef}
          type="file"
          accept=".tar.gz,.tgz"
          aria-label={t('settingsBackup.chooseFileAria')}
          className="block w-full text-sm text-muted-foreground file:mr-3 file:rounded-md file:border-0 file:bg-primary file:px-3 file:py-1.5 file:text-sm file:text-primary-foreground hover:file:bg-primary/90"
          onChange={onFileChange}
          disabled={restoring}
        />
        <p className="text-xs text-muted-foreground">{t('settingsBackup.restoreHint')}</p>
      </div>
    </section>
  );
}
