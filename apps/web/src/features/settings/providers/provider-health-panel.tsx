'use client';

import { MODEL_FAILURE_CODES } from '@wbfm/shared/errors';
import { useI18n } from '@/lib/i18n/use-i18n';
import { useProviderHealth } from '@/lib/hooks/provider';

/**
 * v4.19：供应商健康度（只读）。数字全部可由本机会话事件复算，
 * 不展示正文、不做写操作，也不新增侧栏入口。
 */
export function ProviderHealthPanel() {
  const { t } = useI18n();
  const { data, isLoading, isError } = useProviderHealth(7);
  const rows = data?.rows ?? [];
  const active = rows.filter((row) => row.failureTotal > 0 || row.switches > 0);

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

  return (
    <section
      className="space-y-2 rounded-md border bg-ui-row p-3"
      data-testid="provider-health-panel"
      aria-label={t('settingsProviders.health.title')}
    >
      <div>
        <h3 className="text-sm font-medium">{t('settingsProviders.health.title')}</h3>
        <p className="text-xs text-muted-foreground">
          {t('settingsProviders.health.description')}
        </p>
      </div>
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
