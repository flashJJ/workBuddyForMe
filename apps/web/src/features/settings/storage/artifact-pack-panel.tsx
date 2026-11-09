'use client';

import * as React from 'react';
import { apiGet, ApiClientError, withManagedHeaders } from '@/lib/api/client';
import { API } from '@/lib/api/endpoints';
import { useToast } from '@/components/common/toast';
import { Button } from '@/components/ui/button';
import { useI18n } from '@/lib/i18n/use-i18n';

interface ArtifactItem {
  id: string;
  filename: string;
  mimeType: string;
  byteSize: number;
  createdAt: string;
}

const MAX_COUNT = 100;
const MAX_BYTES = 200 * 1024 * 1024;

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

/** v2.32 M3：跨会话产物清单 + 多选打包下载（POST /api/artifacts/export） */
export function ArtifactPackPanel() {
  const { t } = useI18n();
  const toast = useToast();
  const [items, setItems] = React.useState<ArtifactItem[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [loadError, setLoadError] = React.useState(false);
  const [selected, setSelected] = React.useState<string[]>([]);
  const [exporting, setExporting] = React.useState(false);

  const load = React.useCallback(async () => {
    setLoading(true);
    setLoadError(false);
    try {
      const data = await apiGet<{ items?: ArtifactItem[] }>(API.artifacts);
      setItems(Array.isArray(data?.items) ? data.items : []);
    } catch {
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void load();
  }, [load]);

  const selectedBytes = items
    .filter((item) => selected.includes(item.id))
    .reduce((sum, item) => sum + item.byteSize, 0);
  const overLimit = selected.length > MAX_COUNT || selectedBytes > MAX_BYTES;

  const toggle = (id: string) => {
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const toggleAll = () => {
    setSelected((prev) => (prev.length === items.length ? [] : items.map((item) => item.id)));
  };

  const download = async () => {
    if (selected.length === 0 || overLimit) return;
    setExporting(true);
    try {
      const headers = new Headers(withManagedHeaders().headers);
      headers.set('content-type', 'application/json');
      const res = await fetch(API.artifactsExport, {
        method: 'POST',
        headers,
        body: JSON.stringify({ ids: selected }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new ApiClientError(
          body.error?.code ?? 'EXPORT_FAILED',
          body.error?.message ?? t('settingsBackup.artifacts.failed'),
          res.status,
        );
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `wbfm-artifacts-${new Date().toISOString().slice(0, 10)}.tar.gz`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (error) {
      toast.error(
        error instanceof ApiClientError ? error.message : t('settingsBackup.artifacts.failed'),
      );
    } finally {
      setExporting(false);
    }
  };

  return (
    <section className="space-y-3 rounded-lg border bg-card p-4" data-testid="artifact-pack-panel">
      <div className="flex items-center justify-between gap-2">
        <h3 className="font-medium">{t('settingsBackup.artifacts.title')}</h3>
        <Button type="button" variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
          {t('settingsBackup.artifacts.refresh')}
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">{t('settingsBackup.artifacts.description')}</p>

      {loading && <p className="text-sm text-muted-foreground">{t('settingsBackup.artifacts.loading')}</p>}
      {loadError && <p className="text-sm text-destructive">{t('settingsBackup.artifacts.loadFailed')}</p>}
      {!loading && !loadError && items.length === 0 && (
        <p className="text-sm text-muted-foreground">{t('settingsBackup.artifacts.empty')}</p>
      )}

      {items.length > 0 && (
        <>
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <Button type="button" variant="outline" size="sm" onClick={toggleAll}>
              {selected.length === items.length
                ? t('settingsBackup.artifacts.clear')
                : t('settingsBackup.artifacts.selectAll')}
            </Button>
            <span className="text-muted-foreground">
              {t('settingsBackup.artifacts.selected', {
                count: selected.length,
                size: formatBytes(selectedBytes),
              })}
            </span>
            <span className="text-muted-foreground">{t('settingsBackup.artifacts.limitHint')}</span>
          </div>
          {overLimit && (
            <p className="text-xs text-destructive">{t('settingsBackup.artifacts.overLimit')}</p>
          )}
          <ul className="max-h-64 space-y-1 overflow-y-auto rounded-md border p-2">
            {items.map((item) => (
              <li key={item.id}>
                <label className="flex cursor-pointer items-center gap-2 rounded px-1 py-0.5 text-xs hover:bg-muted/50">
                  <input
                    type="checkbox"
                    className="h-3.5 w-3.5 rounded border-muted-foreground"
                    checked={selected.includes(item.id)}
                    onChange={() => toggle(item.id)}
                  />
                  <span className="min-w-0 flex-1 truncate">{item.filename}</span>
                  <span className="shrink-0 text-muted-foreground">{formatBytes(item.byteSize)}</span>
                  <span className="shrink-0 text-muted-foreground">
                    {item.createdAt.slice(0, 10)}
                  </span>
                </label>
              </li>
            ))}
          </ul>
          <div className="flex justify-end">
            <Button
              type="button"
              onClick={() => void download()}
              disabled={selected.length === 0 || overLimit || exporting}
            >
              {exporting
                ? t('settingsBackup.artifacts.exporting')
                : t('settingsBackup.artifacts.download')}
            </Button>
          </div>
        </>
      )}
    </section>
  );
}
