'use client';

import * as React from 'react';
import { RefreshCw } from 'lucide-react';
import type { RunEvidenceChain, RunEvidenceQuery } from '@wbfm/shared/schemas';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { SimpleSelect } from '@/components/ui/simple-select';
import { EmptyState, ErrorState, Spinner } from '@/components/common/state';
import { useToast } from '@/components/common/toast';
import { withManagedHeaders } from '@/lib/api/client';
import { API } from '@/lib/api/endpoints';
import { formatDurationMs } from '@/lib/runs/run-outcome';
import { useI18n } from '@/lib/i18n/use-i18n';
import { useRunReport, runReportQueryString, type RunReportFilter } from './use-run-report';

const CHAIN_LABEL_KEYS: Record<RunEvidenceChain, 'reports.chain.task' | 'reports.chain.flow' | 'reports.chain.agent'> = {
  task: 'reports.chain.task',
  flow: 'reports.chain.flow',
  agent: 'reports.chain.agent',
};

function localDay(offset = 0): string {
  const date = new Date();
  date.setDate(date.getDate() + offset);
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** v2.6 M5 P1-2：运行证据汇总页（只读统计 + Markdown/CSV 导出） */
export function RunReportPage() {
  const { t, locale } = useI18n();
  const toast = useToast();
  const [from, setFrom] = React.useState(() => localDay(-6));
  const [to, setTo] = React.useState(() => localDay(0));
  const [chain, setChain] = React.useState<RunEvidenceQuery['chain']>('all');
  const filter: RunReportFilter = { from, to, chain };
  const { data, isLoading, isError, refetch, isFetching } = useRunReport(filter);
  const [exporting, setExporting] = React.useState<'markdown' | 'csv' | null>(null);

  const exportFile = async (format: 'markdown' | 'csv') => {
    setExporting(format);
    try {
      const params = `${runReportQueryString(filter, format)}&locale=${locale === 'en-US' ? 'en' : 'zh'}`;
      const response = await fetch(`${API.runEvidence}?${params}`, withManagedHeaders());
      if (!response.ok) throw new Error(String(response.status));
      const blob = await response.blob();
      const disposition = response.headers.get('content-disposition') ?? '';
      const filename = /filename="([^"]+)"/.exec(disposition)?.[1] ?? `run-report.${format === 'markdown' ? 'md' : 'csv'}`;
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = filename;
      anchor.click();
      URL.revokeObjectURL(url);
      toast.success(t('reports.exported'));
    } catch {
      toast.error(t('reports.exportFailed'));
    } finally {
      setExporting(null);
    }
  };

  const totals = data?.totals;
  const rate = totals?.successRate == null ? t('reports.noSamples') : `${totals.successRate}%`;
  const median = formatDurationMs(totals?.medianDurationMs) ?? t('reports.noSamples');

  return (
    <div className="h-full overflow-auto px-6 py-4" data-testid="run-report-page">
      <div className="mb-4">
        <h1 className="text-lg font-semibold">{t('reports.title')}</h1>
        <p className="mt-1 text-xs text-muted-foreground">{t('reports.description')}</p>
        <p className="mt-1 text-[11px] text-muted-foreground">{t('reports.timeHint')}</p>
      </div>

      <div className="mb-4 flex flex-wrap items-end gap-2">
        <Input
          type="date"
          className="h-9 w-40"
          aria-label={t('reports.fromAria')}
          value={from}
          max={to || undefined}
          onChange={(event) => setFrom(event.target.value)}
        />
        <Input
          type="date"
          className="h-9 w-40"
          aria-label={t('reports.toAria')}
          value={to}
          min={from || undefined}
          onChange={(event) => setTo(event.target.value)}
        />
        <SimpleSelect
          value={chain}
          onValueChange={(value) => setChain(value as RunEvidenceQuery['chain'])}
          aria-label={t('reports.chainAria')}
          className="h-9 w-32"
        >
          <option value="all">{t('reports.chain.all')}</option>
          <option value="task">{t('reports.chain.task')}</option>
          <option value="flow">{t('reports.chain.flow')}</option>
          <option value="agent">{t('reports.chain.agent')}</option>
        </SimpleSelect>
        <a
          href="/timeline"
          className="inline-flex h-9 items-center rounded-md border px-3 text-sm hover:bg-muted"
          data-testid="run-report-timeline-link"
        >
          {t('timeline.title')}
        </a>
        <Button variant="outline" size="sm" disabled={isFetching} onClick={() => void refetch()}>
          <RefreshCw className={`mr-1 h-3.5 w-3.5 ${isFetching ? 'animate-spin' : ''}`} />
          {t('reports.refresh')}
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={Boolean(exporting) || !data}
          data-testid="run-report-export-md"
          onClick={() => void exportFile('markdown')}
        >
          {t('reports.exportMarkdown')}
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={Boolean(exporting) || !data}
          data-testid="run-report-export-csv"
          onClick={() => void exportFile('csv')}
        >
          {t('reports.exportCsv')}
        </Button>
      </div>

      {isLoading ? (
        <Spinner />
      ) : isError ? (
        <ErrorState message={t('reports.loadFailed')} onRetry={() => void refetch()} />
      ) : data ? (
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <SummaryCard label={t('reports.summary.total')} value={String(totals?.total ?? 0)} />
            <SummaryCard label={t('reports.summary.successRate')} value={rate} />
            <SummaryCard label={t('reports.summary.median')} value={median} />
            <SummaryCard label={t('reports.summary.failed')} value={String(totals?.failed ?? 0)} />
          </div>

          {data.totals.total === 0 ? (
            <EmptyState title={t('reports.empty')} description="" />
          ) : (
            <div className="overflow-hidden rounded-md border">
              <table className="w-full text-sm" data-testid="run-report-table">
                <thead className="bg-muted/50 text-xs text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 text-left">{t('reports.table.chain')}</th>
                    <th className="px-3 py-2 text-right">{t('reports.table.total')}</th>
                    <th className="px-3 py-2 text-right">{t('reports.table.succeeded')}</th>
                    <th className="px-3 py-2 text-right">{t('reports.table.failed')}</th>
                    <th className="px-3 py-2 text-right">{t('reports.table.cancelled')}</th>
                    <th className="px-3 py-2 text-right">{t('reports.table.running')}</th>
                    <th className="px-3 py-2 text-right">{t('reports.table.successRate')}</th>
                    <th className="px-3 py-2 text-right">{t('reports.table.median')}</th>
                  </tr>
                </thead>
                <tbody>
                  {data.chains.map((row) => (
                    <tr key={row.chain} className="border-t">
                      <td className="px-3 py-2 font-medium">{t(CHAIN_LABEL_KEYS[row.chain])}</td>
                      <td className="px-3 py-2 text-right">{row.total}</td>
                      <td className="px-3 py-2 text-right text-teal-600 dark:text-teal-400">{row.succeeded}</td>
                      <td className="px-3 py-2 text-right text-red-600 dark:text-red-400">{row.failed}</td>
                      <td className="px-3 py-2 text-right">{row.cancelled}</td>
                      <td className="px-3 py-2 text-right">{row.running}</td>
                      <td className="px-3 py-2 text-right">
                        {row.successRate == null ? t('reports.noSamples') : `${row.successRate}%`}
                      </td>
                      <td className="px-3 py-2 text-right">
                        {formatDurationMs(row.medianDurationMs) ?? t('reports.noSamples')}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div>
            <h2 className="mb-2 text-sm font-medium">{t('reports.failures')}</h2>
            {data.chains.every((row) => row.failures.length === 0) ? (
              <p className="text-xs text-muted-foreground">{t('reports.noFailures')}</p>
            ) : (
              <ul className="flex flex-wrap gap-2" data-testid="run-report-failures">
                {data.chains.flatMap((row) =>
                  row.failures.map((failure) => (
                    <li
                      key={`${row.chain}-${failure.code}`}
                      className="rounded-full border bg-muted/40 px-2.5 py-1 text-xs"
                    >
                      {t(CHAIN_LABEL_KEYS[row.chain])} · {failure.code} × {failure.count}
                    </li>
                  )),
                )}
              </ul>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function SummaryCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border bg-card p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-xl font-semibold">{value}</p>
    </div>
  );
}
