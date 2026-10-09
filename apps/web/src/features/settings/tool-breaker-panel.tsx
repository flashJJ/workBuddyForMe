'use client';

import * as React from 'react';
import type { ToolBreakerSnapshot } from '@wbfm/core/tools';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/common/state';
import { useToast } from '@/components/common/toast';
import { useToolBreakers, useToolBreakerMutations } from '@/lib/hooks/use-tool-breakers';
import { useI18n } from '@/lib/i18n/use-i18n';
import { useIntl } from '@/lib/i18n/use-intl';
import { errorText } from '@/lib/i18n/resolve-error';
import type { MessageKey } from '@wbfm/shared/i18n';

function statusMeta(
  status: ToolBreakerSnapshot['status'],
): { labelKey: MessageKey; variant: 'warning' | 'danger' } {
  if (status === 'open') {
    return { labelKey: 'settingsMcp.breaker.statusOpen', variant: 'danger' };
  }
  return { labelKey: 'settingsMcp.breaker.statusHalfOpen', variant: 'warning' };
}

export function ToolBreakerPanel() {
  const { t } = useI18n();
  const intl = useIntl();
  const formatTrippedAt = (iso: number | null) => (iso ? intl.formatCompactDateTime(iso) : '—');
  const { data: breakers, isLoading } = useToolBreakers();
  const mutations = useToolBreakerMutations();
  const toast = useToast();

  const reset = async (name: string) => {
    try {
      await mutations.reset.mutateAsync(name);
      toast.success(t('settingsMcp.breaker.resetDone', { name }));
    } catch (error: unknown) {
      toast.error(errorText(error, t, { fallback: 'settingsMcp.breaker.resetFailed' }));
    }
  };

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">{t('settingsMcp.breaker.title')}</h2>
          <p className="text-sm text-muted-foreground">
            {t('settingsMcp.breaker.description')}
          </p>
        </div>
      </div>

      {isLoading && (
        <p className="text-sm text-muted-foreground">{t('common.actions.loading')}</p>
      )}

      {!isLoading && (!breakers || breakers.length === 0) && (
        <EmptyState
          title={t('settingsMcp.breaker.emptyTitle')}
          description={t('settingsMcp.breaker.emptyDescription')}
        />
      )}

      {!isLoading && breakers && breakers.length > 0 && (
        <div className="space-y-2">
          {breakers.map((b) => {
            const { labelKey, variant } = statusMeta(b.status);
            return (
              <div
                key={b.name}
                className="flex items-center justify-between rounded-md border px-3 py-2 text-sm"
                data-testid={`breaker-${b.name}`}
              >
                <div className="min-w-0 flex-1 space-y-0.5">
                  <div className="flex items-center gap-2 font-medium">
                    <code className="rounded bg-muted px-1 text-xs">{b.name}</code>
                    <Badge variant={variant}>{t(labelKey)}</Badge>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {t('settingsMcp.breaker.failuresLine', {
                      count: b.failures,
                      date: formatTrippedAt(b.trippedAt),
                    })}
                  </div>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={mutations.reset.isPending}
                  onClick={() => void reset(b.name)}
                  className="ml-2 shrink-0"
                >
                  {t('common.actions.reset')}
                </Button>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
