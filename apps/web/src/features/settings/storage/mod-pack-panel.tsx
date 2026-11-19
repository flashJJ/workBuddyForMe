'use client';

import * as React from 'react';
import { useQuery } from '@tanstack/react-query';
import type { ModInstallRecord } from '@wbfm/shared/schemas';
import { Button } from '@/components/ui/button';
import { apiGet } from '@/lib/api/client';
import { API, QUERY_KEYS } from '@/lib/api/endpoints';
import { useI18n } from '@/lib/i18n/use-i18n';
import { ModPackExportDialog } from './mod-pack-export-dialog';
import { ModPackImportDialog } from './mod-pack-import-dialog';

/** 设置页：.wbfm-pack 导出/导入入口 + 最近导入记录（M5 / v4.12） */
export function ModPackPanel() {
  const { t } = useI18n();
  const [exportOpen, setExportOpen] = React.useState(false);
  const [importOpen, setImportOpen] = React.useState(false);
  const installs = useQuery<{ installs: ModInstallRecord[] }>({
    queryKey: QUERY_KEYS.modPackInstalls,
    queryFn: () => apiGet(API.modPackInstalls),
  });
  const records = installs.data?.installs ?? [];

  return (
    <section className="space-y-4 rounded-lg border bg-ui-card p-4" data-testid="mod-pack-panel">
      <h3 className="font-medium">{t('modPack.title')}</h3>
      <p className="text-xs text-muted-foreground">{t('modPack.description')}</p>
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" onClick={() => setExportOpen(true)}>
          {t('modPack.exportOpen')}
        </Button>
        <Button type="button" variant="outline" onClick={() => setImportOpen(true)}>
          {t('modPack.importOpen')}
        </Button>
      </div>

      <div className="space-y-1" data-testid="mod-pack-installs">
        <p className="text-xs font-medium">{t('modPack.history.title')}</p>
        {installs.isLoading ? (
          <p className="text-xs text-muted-foreground">{t('common.actions.loading')}</p>
        ) : null}
        {installs.isError ? (
          <p className="text-xs text-destructive">{t('modPack.history.failed')}</p>
        ) : null}
        {!installs.isLoading && !installs.isError && records.length === 0 ? (
          <p className="text-xs text-muted-foreground">{t('modPack.history.empty')}</p>
        ) : null}
        {records.length > 0 ? (
          <ul className="space-y-1">
            {records.map((record) => (
              <li
                key={record.id}
                className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 rounded-md bg-ui-row px-2 py-1 text-xs"
              >
                <span className="font-medium">{record.name}</span>
                <span className="text-muted-foreground">
                  {t('modPack.history.item', {
                    version: record.packVersion,
                    time: new Date(record.importedAt).toLocaleString(),
                  })}
                </span>
                <span className="text-muted-foreground">
                  {t('modPack.history.counts', {
                    cards: record.summary.characterCardIds.length,
                    scenes: record.summary.stageSceneIds.length,
                    backgrounds: record.summary.stageBackgroundFileRefs.length,
                  })}
                </span>
              </li>
            ))}
          </ul>
        ) : null}
      </div>

      <ModPackExportDialog open={exportOpen} onOpenChange={setExportOpen} />
      <ModPackImportDialog open={importOpen} onOpenChange={setImportOpen} />
    </section>
  );
}
