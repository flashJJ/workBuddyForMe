'use client';

import * as React from 'react';
import { Download } from 'lucide-react';
import { MODEL_FAILURE_CODES } from '@wbfm/shared/errors';
import { useI18n } from '@/lib/i18n/use-i18n';
import { useProviderHealth } from '@/lib/hooks/provider';
import {
  buildHealthCsv,
  buildHealthMarkdown,
  healthExportFilename,
  type HealthExportFormat,
  type HealthExportLabels,
} from './provider-health-export';

function saveText(content: string, filename: string, mime: string): void {
  const url = URL.createObjectURL(new Blob([content], { type: mime }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * v4.19：供应商健康度（只读）。数字全部可由本机会话事件复算，
 * 不展示正文、不做写操作，也不新增侧栏入口。
 */
export function ProviderHealthPanel() {
  const { t } = useI18n();
  const { data, isLoading, isError } = useProviderHealth(7);
  const rows = data?.rows ?? [];
  const active = rows.filter((row) => row.failureTotal > 0 || row.switches > 0);
  const [exportFailed, setExportFailed] = React.useState(false);

  const codeLabel = (code: string): string => {
    switch (code) {
      case 'auth_failed':
        return t('settingsProviders.health.codes.auth_failed');
      case 'rate_limited':
        return t('settingsProviders.health.codes.rate_limited');
      case 'timeout':
        return t('settingsProviders.health.codes.timeout');
      case 'stream_interrupted':
        return t('settingsProviders.health.codes.stream_interrupted');
      case 'context_overflow':
        return t('settingsProviders.health.codes.context_overflow');
      case 'provider_5xx':
        return t('settingsProviders.health.codes.provider_5xx');
      case 'unknown':
        return t('settingsProviders.health.codes.unknown');
      default:
        return code;
    }
  };

  const exportHealth = (format: HealthExportFormat) => {
    setExportFailed(false);
    try {
      const labels: HealthExportLabels = {
        title: t('settingsProviders.health.title'),
        provider: t('settingsProviders.health.exportProvider'),
        status: t('settingsProviders.health.exportStatus'),
        failures: t('settingsProviders.health.exportFailures'),
        codes: t('settingsProviders.health.exportCodes'),
        switches: t('settingsProviders.health.exportSwitches'),
        lastFailure: t('settingsProviders.health.exportLastFailure'),
        enabled: t('settingsProviders.health.exportEnabled'),
        disabled: t('settingsProviders.health.disabled'),
        unknown: t('settingsProviders.health.unknownProvider'),
        none: '—',
      };
      const content =
        format === 'md'
          ? buildHealthMarkdown(rows, labels, codeLabel)
          : buildHealthCsv(rows, labels, codeLabel);
      saveText(
        content,
        healthExportFilename(format),
        format === 'md' ? 'text/markdown;charset=utf-8' : 'text/csv;charset=utf-8',
      );
    } catch {
      setExportFailed(true);
    }
  };

  return (
    <section
      className="space-y-2 rounded-md border bg-ui-row p-3"
      data-testid="provider-health-panel"
      aria-label={t('settingsProviders.health.title')}
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <h3 className="text-sm font-medium">{t('settingsProviders.health.title')}</h3>
          <p className="text-xs text-muted-foreground">
            {t('settingsProviders.health.description')}
          </p>
        </div>
        {rows.length > 0 ? (
          // v4.20：导出菜单（Markdown / CSV），只导出当前面板报告数据
          <details className="relative shrink-0" data-testid="provider-health-export">
            <summary className="flex cursor-pointer list-none items-center gap-1 rounded border px-2 py-1 text-xs text-muted-foreground hover:bg-accent hover:text-foreground">
              <Download className="h-3.5 w-3.5" />
              {t('settingsProviders.health.export')}
            </summary>
            <div className="absolute right-0 z-10 mt-1 flex w-32 flex-col rounded-md border bg-ui-card p-1 shadow-md">
              <button
                type="button"
                className="rounded px-2 py-1 text-left text-xs hover:bg-accent"
                data-testid="provider-health-export-markdown"
                onClick={() => exportHealth('md')}
              >
                {t('settingsProviders.health.exportMarkdown')}
              </button>
              <button
                type="button"
                className="rounded px-2 py-1 text-left text-xs hover:bg-accent"
                data-testid="provider-health-export-csv"
                onClick={() => exportHealth('csv')}
              >
                {t('settingsProviders.health.exportCsv')}
              </button>
            </div>
          </details>
        ) : null}
      </div>
      {exportFailed ? (
        <p className="text-xs text-destructive" role="alert" data-testid="provider-health-export-error">
          {t('settingsProviders.health.exportFailed')}
        </p>
      ) : null}
      {isLoading && <p className="text-xs text-muted-foreground">{t('common.actions.loading')}</p>}
      {isError && (
        <p className="text-xs text-destructive">{t('settingsProviders.health.loadFailed')}</p>
      )}
      {!isLoading && !isError && active.length === 0 && (
        <p className="text-xs text-muted-foreground">{t('settingsProviders.health.empty')}</p>
      )}
      {active.length > 0 && (
        <ul className="space-y-1.5" data-testid="provider-health-list">
          {active.map((row) => (
            <li
              key={row.providerId}
              className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs"
              data-testid="provider-health-row"
            >
              <span className="font-medium">{row.providerName}</span>
              {row.enabled === false && (
                <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                  {t('settingsProviders.health.disabled')}
                </span>
              )}
              {row.failureTotal > 0 && (
                <span className="text-destructive">
                  {t('settingsProviders.health.failures', { count: row.failureTotal })}
                </span>
              )}
              {row.switches > 0 && (
                <span className="text-muted-foreground">
                  {t('settingsProviders.health.switches', { count: row.switches })}
                </span>
              )}
              {Object.entries(row.failures).map(([code, count]) => (
                <span key={code} className="rounded bg-muted px-1.5 py-0.5 text-[10px]">
                  {codeLabel(code)} × {count}
                </span>
              ))}
              {row.lastFailureAt && (
                <span className="text-muted-foreground">
                  {t('settingsProviders.health.lastFailure', {
                    time: new Date(row.lastFailureAt).toLocaleString(),
                  })}
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
