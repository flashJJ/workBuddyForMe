'use client';

import * as React from 'react';
import { apiGet, apiPost, ApiClientError } from '@/lib/api/client';
import { API } from '@/lib/api/endpoints';
import { useToast } from '@/components/common/toast';
import { Button } from '@/components/ui/button';
import { useI18n } from '@/lib/i18n/use-i18n';

type Bucket = 'database' | 'files' | 'attachments' | 'spills' | 'capabilities' | 'logs' | 'other';

interface StorageUsage {
  totalBytes: number;
  items: Record<Bucket, number>;
  scannedFiles: number;
  truncated: boolean;
}

interface OrphanScan {
  files: Array<{ name: string; bytes: number }>;
  unreferenced: Array<{ id: string; name: string; bytes: number; filename: string; createdAt: string }>;
  filesBytes: number;
  unreferencedBytes: number;
  totalBytes: number;
}

function orphanNames(scan: OrphanScan): string[] {
  return [
    ...scan.files.map((item) => item.name),
    ...scan.unreferenced.map((item) => item.name),
  ];
}

interface TrashEntry {
  date: string;
  name: string;
  bytes: number;
  trashedAt: string;
}

const BUCKETS: Bucket[] = ['database', 'files', 'attachments', 'spills', 'capabilities', 'logs', 'other'];

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

/**
 * v2.32 M4：分项占用 + 孤儿附件回收。
 * 回收只移动、不物理删除；恢复与到期清理都在同一面板完成。
 */
export function StorageCleanupPanel() {
  const { t } = useI18n();
  const toast = useToast();
  const [usage, setUsage] = React.useState<StorageUsage | null>(null);
  const [loadingUsage, setLoadingUsage] = React.useState(true);
  const [usageError, setUsageError] = React.useState(false);
  const [scan, setScan] = React.useState<OrphanScan | null>(null);
  const [scanning, setScanning] = React.useState(false);
  const [trashing, setTrashing] = React.useState(false);
  const [trash, setTrash] = React.useState<TrashEntry[]>([]);

  const loadUsage = React.useCallback(async () => {
    setLoadingUsage(true);
    setUsageError(false);
    try {
      setUsage(await apiGet<StorageUsage>(API.storageUsage));
    } catch {
      setUsageError(true);
    } finally {
      setLoadingUsage(false);
    }
  }, []);

  const loadTrash = React.useCallback(async () => {
    try {
      const data = await apiGet<{ entries?: TrashEntry[] }>(API.storageTrash);
      setTrash(Array.isArray(data?.entries) ? data.entries : []);
    } catch {
      /* 列表失败不阻断占用统计 */
    }
  }, []);

  React.useEffect(() => {
    void loadUsage();
    void loadTrash();
  }, [loadUsage, loadTrash]);

  const runScan = async () => {
    setScanning(true);
    try {
      setScan(await apiPost<OrphanScan>(API.storageOrphansScan));
    } catch {
      toast.error(t('settingsBackup.storage.failed'));
    } finally {
      setScanning(false);
    }
  };

  const moveToTrash = async () => {
    const names = scan ? orphanNames(scan) : [];
    if (names.length === 0) return;
    setTrashing(true);
    try {
      const result = await apiPost<{ moved: number; totalBytes: number; recordsRemoved: number }>(
        API.storageOrphansTrash,
        { names },
      );
      toast.success(
        t('settingsBackup.storage.trashDone', {
          count: result.moved,
          size: formatBytes(result.totalBytes),
        }),
      );
      setScan(null);
      await Promise.all([loadUsage(), loadTrash()]);
    } catch (error) {
      toast.error(
        error instanceof ApiClientError ? error.message : t('settingsBackup.storage.trashFailed'),
      );
    } finally {
      setTrashing(false);
    }
  };

  const restore = async (entry: TrashEntry) => {
    try {
      await apiPost(API.storageTrashRestore, { date: entry.date, name: entry.name });
      toast.success(t('settingsBackup.storage.restoreDone', { name: entry.name }));
      await Promise.all([loadUsage(), loadTrash()]);
    } catch (error) {
      toast.error(
        error instanceof ApiClientError ? error.message : t('settingsBackup.storage.restoreFailed'),
      );
    }
  };

  const purge = async () => {
    if (!window.confirm(t('settingsBackup.storage.purgeConfirm'))) return;
    try {
      const result = await apiPost<{ removedDates: string[]; bytes: number }>(
        API.storageTrashPurge,
      );
      toast.success(
        t('settingsBackup.storage.purgeDone', {
          count: result.removedDates.length,
          size: formatBytes(result.bytes),
        }),
      );
      await Promise.all([loadUsage(), loadTrash()]);
    } catch {
      toast.error(t('settingsBackup.storage.failed'));
    }
  };

  return (
    <section className="space-y-4 rounded-lg border bg-card p-4" data-testid="storage-cleanup-panel">
      <div className="flex items-center justify-between gap-2">
        <h3 className="font-medium">{t('settingsBackup.storage.title')}</h3>
        <Button type="button" variant="outline" size="sm" onClick={() => void loadUsage()} disabled={loadingUsage}>
          {t('settingsBackup.storage.refresh')}
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">{t('settingsBackup.storage.description')}</p>

      {loadingUsage && <p className="text-sm text-muted-foreground">{t('settingsBackup.storage.loading')}</p>}
      {usageError && <p className="text-sm text-destructive">{t('settingsBackup.storage.failed')}</p>}
      {usage && (
        <div className="rounded-md border p-2 text-xs">
          <div className="flex justify-between border-b pb-1 font-medium">
            <span>{t('settingsBackup.storage.total')}</span>
            <span>{formatBytes(usage.totalBytes)}</span>
          </div>
          <ul className="mt-1 grid gap-1 sm:grid-cols-2">
            {BUCKETS.map((bucket) => (
              <li key={bucket} className="flex justify-between text-muted-foreground">
                <span>{t(`settingsBackup.storage.buckets.${bucket}`)}</span>
                <span>{formatBytes(usage.items?.[bucket] ?? 0)}</span>
              </li>
            ))}
          </ul>
          {usage.truncated && (
            <p className="mt-1 text-destructive">{t('settingsBackup.storage.truncated')}</p>
          )}
        </div>
      )}

      <div className="space-y-2 rounded-md border p-3">
        <p className="text-sm font-medium">{t('settingsBackup.storage.orphansTitle')}</p>
        <p className="text-xs text-muted-foreground">{t('settingsBackup.storage.orphansHint')}</p>
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" variant="outline" size="sm" onClick={() => void runScan()} disabled={scanning}>
            {scanning ? t('settingsBackup.storage.scanning') : t('settingsBackup.storage.scan')}
          </Button>
          {scan && orphanNames(scan).length === 0 && (
            <span className="text-xs text-muted-foreground">
              {t('settingsBackup.storage.scanEmpty')}
            </span>
          )}
          {scan && orphanNames(scan).length > 0 && (
            <>
              <span className="text-xs text-muted-foreground">
                {t('settingsBackup.storage.scanFoundFiles', {
                  count: scan.files.length,
                  size: formatBytes(scan.filesBytes),
                })}
              </span>
              <span className="text-xs text-muted-foreground">
                {t('settingsBackup.storage.scanFoundUnreferenced', {
                  count: scan.unreferenced.length,
                  size: formatBytes(scan.unreferencedBytes),
                })}
              </span>
              <Button type="button" size="sm" onClick={() => void moveToTrash()} disabled={trashing}>
                {t('settingsBackup.storage.trashAction')}
              </Button>
            </>
          )}
        </div>
      </div>

      <div className="space-y-2 rounded-md border p-3">
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm font-medium">{t('settingsBackup.storage.trashTitle')}</p>
          <Button type="button" variant="outline" size="sm" onClick={() => void purge()} disabled={trash.length === 0}>
            {t('settingsBackup.storage.purge')}
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">{t('settingsBackup.storage.purgeHint')}</p>
        {trash.length === 0 ? (
          <p className="text-xs text-muted-foreground">{t('settingsBackup.storage.trashEmpty')}</p>
        ) : (
          <ul className="max-h-48 space-y-1 overflow-y-auto">
            {trash.map((entry) => (
              <li
                key={`${entry.date}/${entry.name}`}
                className="flex items-center gap-2 rounded px-1 py-0.5 text-xs hover:bg-muted/50"
              >
                <span className="min-w-0 flex-1 truncate">{entry.name}</span>
                <span className="shrink-0 text-muted-foreground">{formatBytes(entry.bytes)}</span>
                <span className="shrink-0 text-muted-foreground">{entry.date}</span>
                <Button type="button" variant="ghost" size="sm" onClick={() => void restore(entry)}>
                  {t('settingsBackup.storage.restore')}
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
