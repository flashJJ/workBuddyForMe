'use client';

import * as React from 'react';
import { Button } from '@/components/ui/button';
import { useI18n } from '@/lib/i18n/use-i18n';
import { RelationshipReportDialog } from './relationship-report-dialog';

/** 设置页：关系报告（自包含单文件 HTML，M5） */
export function RelationshipReportPanel() {
  const { t } = useI18n();
  const [open, setOpen] = React.useState(false);

  return (
    <section className="space-y-4 rounded-lg border bg-card p-4" data-testid="relationship-report-panel">
      <h3 className="font-medium">{t('relationshipReport.title')}</h3>
      <p className="text-xs text-muted-foreground">{t('relationshipReport.description')}</p>
      <div>
        <Button type="button" variant="outline" onClick={() => setOpen(true)}>
          {t('relationshipReport.openButton')}
        </Button>
      </div>
      <RelationshipReportDialog open={open} onOpenChange={setOpen} />
    </section>
  );
}
