'use client';

import * as React from 'react';
import type { DocumentComparisonResult, DocumentRecord } from '@wbfm/shared/types';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useToast } from '@/components/common/toast';
import { ApiClientError } from '@/lib/api/client';
import { useDocumentComparison } from '@/lib/hooks/knowledge';
import { useI18n } from '@/lib/i18n/use-i18n';

interface Props {
  documents: DocumentRecord[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/** v2.19 M3：跨文档对比弹窗（章节/表格产物，可预览与下载） */
export function DocumentCompareDialog({ documents, open, onOpenChange }: Props) {
  const { t, locale } = useI18n();
  const toast = useToast();
  const compare = useDocumentComparison();
  const usable = React.useMemo(
    () => documents.filter((doc) => doc.status === 'indexed' || doc.status === 'partial'),
    [documents],
  );
  const [leftId, setLeftId] = React.useState('');
  const [rightId, setRightId] = React.useState('');
  const [format, setFormat] = React.useState<'md' | 'html'>('html');
  const [result, setResult] = React.useState<DocumentComparisonResult | null>(null);

  React.useEffect(() => {
    if (!open) return;
    const ids = usable.map((doc) => doc.id);
    setLeftId((previous) => (ids.includes(previous) ? previous : ids[0] ?? ''));
    setRightId((previous) => {
      if (ids.includes(previous) && previous !== leftId) return previous;
      return ids.find((id) => id !== (ids.includes(leftId) ? leftId : ids[0])) ?? '';
    });
    setResult(null);
  }, [open, usable, leftId]);

  const changeLeft = (id: string) => {
    setLeftId(id);
    setResult(null);
    if (id === rightId) {
      const next = usable.find((doc) => doc.id !== id);
      setRightId(next?.id ?? '');
    }
  };

  const generate = async () => {
    if (!leftId || !rightId || leftId === rightId) return;
    setResult(null);
    try {
      const data = await compare.mutateAsync({
        leftDocumentId: leftId,
        rightDocumentId: rightId,
        format,
        locale: locale.startsWith('en') ? 'en' : 'zh',
      });
      setResult(data);
      toast.success(t('knowledgeCompare.resultTitle'));
    } catch (error) {
      toast.error(
        error instanceof ApiClientError ? error.message : t('knowledgeCompare.failed'),
      );
    }
  };

  const artifactUrl = result ? `/api/artifacts/${result.artifact.attachmentId}` : '';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl" data-testid="document-compare-dialog">
        <DialogHeader>
          <DialogTitle>{t('knowledgeCompare.title')}</DialogTitle>
          <DialogDescription>{t('knowledgeCompare.description')}</DialogDescription>
        </DialogHeader>

        {usable.length < 2 ? (
          <p className="rounded-md border bg-muted/40 px-3 py-4 text-sm text-muted-foreground">
            {t('knowledgeCompare.needTwo')}
          </p>
        ) : (
          <div className="space-y-3 text-sm">
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="space-y-1">
                <span className="text-xs text-muted-foreground">{t('knowledgeCompare.left')}</span>
                <select
                  className="h-9 w-full rounded-md border bg-background px-2 text-sm"
                  data-testid="compare-left"
                  aria-label={t('knowledgeCompare.left')}
                  value={leftId}
                  onChange={(event) => changeLeft(event.target.value)}
                >
                  {usable.map((doc) => (
                    <option key={doc.id} value={doc.id}>
                      {doc.filename}
                    </option>
                  ))}
                </select>
              </label>
              <label className="space-y-1">
                <span className="text-xs text-muted-foreground">{t('knowledgeCompare.right')}</span>
                <select
                  className="h-9 w-full rounded-md border bg-background px-2 text-sm"
                  data-testid="compare-right"
                  aria-label={t('knowledgeCompare.right')}
                  value={rightId}
                  onChange={(event) => {
                    setRightId(event.target.value);
                    setResult(null);
                  }}
                >
                  {usable.map((doc) => (
                    <option key={doc.id} value={doc.id} disabled={doc.id === leftId}>
                      {doc.filename}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <label className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">{t('knowledgeCompare.format')}</span>
              <select
                className="h-8 rounded-md border bg-background px-2 text-xs"
                data-testid="compare-format"
                aria-label={t('knowledgeCompare.format')}
                value={format}
                onChange={(event) => setFormat(event.target.value as 'md' | 'html')}
              >
                <option value="html">{t('knowledgeCompare.formatHtml')}</option>
                <option value="md">{t('knowledgeCompare.formatMarkdown')}</option>
              </select>
            </label>

            {leftId === rightId && (
              <p className="text-xs text-destructive">{t('knowledgeCompare.sameDoc')}</p>
            )}

            {result && (
              <div className="space-y-3" data-testid="compare-result">
                <div className="rounded-md border bg-muted/30 p-3 text-xs">
                  <p className="font-medium">{result.artifact.title}</p>
                  <p className="mt-1 text-muted-foreground">
                    {t('knowledgeCompare.summarySections', {
                      shared: String(result.summary.sections.shared),
                      left: String(result.summary.sections.leftOnly),
                      right: String(result.summary.sections.rightOnly),
                    })}
                  </p>
                  <p className="text-muted-foreground">
                    {t('knowledgeCompare.summaryTables', {
                      matched: String(result.summary.tables.matched),
                      left: String(result.summary.tables.left),
                      right: String(result.summary.tables.right),
                    })}
                  </p>
                  {result.summary.warnings.length > 0 && (
                    <ul className="mt-2 list-inside list-disc text-amber-700">
                      {result.summary.warnings.map((warning) => (
                        <li key={warning}>{warning}</li>
                      ))}
                    </ul>
                  )}
                  <div className="mt-2 flex gap-3">
                    <a
                      href={artifactUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="text-primary hover:underline"
                      data-testid="compare-preview"
                    >
                      {t('knowledgeCompare.preview')}
                    </a>
                    <a
                      href={`${artifactUrl}?download=1`}
                      className="text-primary hover:underline"
                      data-testid="compare-download"
                    >
                      {t('knowledgeCompare.download')}
                    </a>
                  </div>
                </div>
                {format === 'md' ? (
                  <pre
                    className="max-h-64 overflow-auto whitespace-pre-wrap rounded-md border bg-background p-3 text-xs"
                    data-testid="compare-markdown-preview"
                  >
                    {result.content}
                  </pre>
                ) : (
                  <iframe
                    title={t('knowledgeCompare.previewTitle')}
                    src={artifactUrl}
                    className="h-72 w-full rounded-md border bg-background"
                    data-testid="compare-html-preview"
                  />
                )}
              </div>
            )}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t('common.actions.close')}
          </Button>
          <Button
            type="button"
            data-testid="compare-generate"
            disabled={usable.length < 2 || !leftId || !rightId || leftId === rightId || compare.isPending}
            onClick={() => void generate()}
          >
            {compare.isPending
              ? t('knowledgeCompare.generating')
              : t('knowledgeCompare.generate')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
