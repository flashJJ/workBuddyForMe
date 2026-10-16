'use client';

import * as React from 'react';
import { ApiClientError, withManagedHeaders } from '@/lib/api/client';
import { API } from '@/lib/api/endpoints';
import { useToast } from '@/components/common/toast';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useI18n } from '@/lib/i18n/use-i18n';

type ReportSection = 'overview' | 'assistants' | 'milestones' | 'disturbance' | 'series';
const ALL_SECTIONS: ReportSection[] = ['overview', 'assistants', 'milestones', 'disturbance', 'series'];
const SECTION_LABEL_KEY: Record<ReportSection, string> = {
  overview: 'relationshipReport.sectionOverview',
  assistants: 'relationshipReport.sectionAssistants',
  milestones: 'relationshipReport.sectionMilestones',
  disturbance: 'relationshipReport.sectionDisturbance',
  series: 'relationshipReport.sectionSeries',
};

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function RelationshipReportDialog({ open, onOpenChange }: Props) {
  const { t, locale } = useI18n();
  const toast = useToast();
  const [sections, setSections] = React.useState<ReportSection[]>(ALL_SECTIONS);
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    if (open) setSections(ALL_SECTIONS);
  }, [open]);

  const toggle = (key: ReportSection) => {
    setSections((prev) => (prev.includes(key) ? prev.filter((s) => s !== key) : [...prev, key]));
  };

  const generate = async () => {
    if (sections.length === 0 || busy) return;
    setBusy(true);
    try {
      const headers = new Headers(withManagedHeaders().headers);
      headers.set('content-type', 'application/json');
      const res = await fetch(API.relationshipReport, {
        method: 'POST',
        headers,
        body: JSON.stringify({ locale, sections }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new ApiClientError(body.error?.code ?? 'REPORT_FAILED', body.error?.message ?? '', res.status);
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = locale === 'en-US' ? 'relationship-report.html' : '关系报告.html';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success(t('relationshipReport.done'));
      onOpenChange(false);
    } catch (error) {
      toast.error(
        error instanceof ApiClientError && error.message
          ? error.message
          : t('relationshipReport.failed'),
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t('relationshipReport.title')}</DialogTitle>
          <DialogDescription>{t('relationshipReport.description')}</DialogDescription>
        </DialogHeader>

        <fieldset className="space-y-2" data-testid="relationship-report-sections">
          <p className="text-xs font-medium text-muted-foreground">
            {t('relationshipReport.sectionsTitle')}
          </p>
          {ALL_SECTIONS.map((key) => (
            <label key={key} className="flex cursor-pointer items-center gap-2 rounded-md p-1.5 text-sm hover:bg-muted/50">
              <input
                type="checkbox"
                className="h-4 w-4"
                checked={sections.includes(key)}
                onChange={() => toggle(key)}
              />
              {t(SECTION_LABEL_KEY[key] as Parameters<typeof t>[0])}
            </label>
          ))}
        </fieldset>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            {t('common.actions.cancel')}
          </Button>
          <Button type="button" onClick={() => void generate()} disabled={sections.length === 0 || busy}>
            {busy ? t('relationshipReport.busy') : t('relationshipReport.submit')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
