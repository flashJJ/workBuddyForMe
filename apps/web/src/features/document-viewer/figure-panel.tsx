'use client';

import * as React from 'react';
import type { FigureSummary } from '@wbfm/core/services';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ApiClientError } from '@/lib/api/client';
import { useFigureSummary } from '@/lib/hooks/knowledge';
import { useI18n } from '@/lib/i18n/use-i18n';
import type { DocumentViewerFigure } from './types';

interface Props {
  documentId: string;
  figures: readonly DocumentViewerFigure[];
  visionAvailable: boolean;
}

/** v2.19 M4：图注列表 + 可选视觉模型按需解读（未配置时明确提示） */
export function FigurePanel({ documentId, figures, visionAvailable }: Props) {
  const { t } = useI18n();
  const mutation = useFigureSummary();
  const [pending, setPending] = React.useState<string | null>(null);
  const [summaries, setSummaries] = React.useState<Record<string, FigureSummary>>({});
  const [errors, setErrors] = React.useState<Record<string, string>>({});

  const interpret = async (figure: DocumentViewerFigure) => {
    setPending(figure.blockId);
    setErrors((previous) => {
      const next = { ...previous };
      delete next[figure.blockId];
      return next;
    });
    try {
      const result = await mutation.mutateAsync({ documentId, blockId: figure.blockId });
      setSummaries((previous) => ({ ...previous, [figure.blockId]: result }));
    } catch (error) {
      const message =
        error instanceof ApiClientError ? error.message : t('documentViewer.figureError');
      setErrors((previous) => ({ ...previous, [figure.blockId]: message }));
    } finally {
      setPending(null);
    }
  };

  return (
    <section data-testid="structure-figures">
      <h3 className="mb-2 font-medium">
        {t('documentViewer.figures')} · {figures.length}
      </h3>
      {figures.length === 0 ? (
        <p className="text-xs text-muted-foreground">{t('documentViewer.noFigures')}</p>
      ) : (
        <div className="space-y-2">
          {!visionAvailable ? (
            <p
              className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800"
              data-testid="figure-unavailable"
            >
              {t('documentViewer.figureUnavailable')}
            </p>
          ) : (
            <p className="text-[11px] text-muted-foreground">{t('documentViewer.figureHint')}</p>
          )}
          {figures.map((figure) => {
            const summary = summaries[figure.blockId];
            const busy = pending === figure.blockId;
            return (
              <div
                key={figure.blockId}
                className="rounded-md border px-3 py-2"
                data-testid="figure-item"
                data-block-id={figure.blockId}
              >
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="text-[11px]">
                    {figure.pageNo !== null
                      ? t('documentViewer.figurePage', { page: String(figure.pageNo) })
                      : t('documentViewer.figureNoPage')}
                  </Badge>
                  <span className="min-w-0 flex-1 truncate text-xs" title={figure.caption}>
                    {figure.caption}
                  </span>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-7 shrink-0 px-2 text-xs"
                    data-testid={`figure-interpret-${figure.blockId}`}
                    disabled={!visionAvailable || busy}
                    onClick={() => void interpret(figure)}
                  >
                    {busy
                      ? t('documentViewer.figureInterpreting')
                      : t('documentViewer.figureInterpret')}
                  </Button>
                </div>
                {errors[figure.blockId] && (
                  <p className="mt-1 text-xs text-destructive" data-testid="figure-error">
                    {errors[figure.blockId]}
                  </p>
                )}
                {summary && (
                  <div
                    className="mt-2 rounded bg-muted/40 px-2 py-1.5 text-xs"
                    data-testid="figure-summary"
                  >
                    <p className="mb-1 font-medium">
                      {t('documentViewer.figureSummary')} · {summary.model}
                    </p>
                    <p className="whitespace-pre-wrap">{summary.summary}</p>
                    <p className="mt-1 text-[10px] text-muted-foreground">
                      {t('documentViewer.figureDisclaimer')}
                    </p>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
