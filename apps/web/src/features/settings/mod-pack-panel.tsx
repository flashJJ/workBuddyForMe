'use client';

import * as React from 'react';
import { Button } from '@/components/ui/button';
import { useI18n } from '@/lib/i18n/use-i18n';
import { ModPackExportDialog } from './mod-pack-export-dialog';
import { ModPackImportDialog } from './mod-pack-import-dialog';

/** 设置页：.wbfm-pack 导出/导入入口（M5） */
export function ModPackPanel() {
  const { t } = useI18n();
  const [exportOpen, setExportOpen] = React.useState(false);
  const [importOpen, setImportOpen] = React.useState(false);

  return (
    <section className="space-y-4 rounded-lg border bg-card p-4" data-testid="mod-pack-panel">
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

      <ModPackExportDialog open={exportOpen} onOpenChange={setExportOpen} />
      <ModPackImportDialog open={importOpen} onOpenChange={setImportOpen} />
    </section>
  );
}
