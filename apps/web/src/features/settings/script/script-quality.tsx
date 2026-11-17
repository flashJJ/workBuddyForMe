'use client';

import * as React from 'react';
import type { MessageKey } from '@wbfm/shared/i18n';
import type { CompanionQualityReport } from '@wbfm/shared/script';
import { apiGet } from '@/lib/api/client';
import { useI18n } from '@/lib/i18n/use-i18n';
import { useVisibleQuery } from '@/lib/ui/panel-visibility';
import { SCRIPT_REASON_LABELS } from './script-decisions';

const QUERY_KEY = ['pet-script-quality'] as const;

const STATS = [
  { field: 'repeatRate', label: 'settings.script.quality.repeat' },
  { field: 'dedupeRate', label: 'settings.script.quality.dedupe' },
  { field: 'prefRate', label: 'settings.script.quality.pref' },
  { field: 'freshRate', label: 'settings.script.quality.fresh' },
] as const satisfies ReadonlyArray<{ field: keyof CompanionQualityReport; label: MessageKey }>;

function percent(value: number): string {
  return `${Math.round(value * 100)}%`;
}

/** v4.1：陪伴质量只读卡（数据由服务端汇总，前端只格式化） */
export function ScriptQuality() {
  const { t } = useI18n();
  const query = useVisibleQuery({
    queryKey: QUERY_KEY,
    queryFn: () => apiGet<CompanionQualityReport>('/api/pet/script/quality'),
    staleTime: 60_000,
  });
  const report = query.data;

  return (
    <section className="space-y-2 border-t pt-3" data-testid="script-quality">
      <div>
        <p className="text-sm font-medium">{t('settings.script.quality.title')}</p>
        <p className="mt-1 text-xs text-muted-foreground">{t('settings.script.quality.hint')}</p>
      </div>
      {query.isError ? (
        <p className="text-xs text-muted-foreground" data-testid="script-quality-unavailable">
          {t('settings.script.quality.unavailable')}
        </p>
      ) : report && report.count === 0 ? (
        <p className="text-xs text-muted-foreground" data-testid="script-quality-empty">
          {t('settings.script.quality.empty')}
        </p>
      ) : report ? (
        <>
          <p className="text-xs text-muted-foreground" data-testid="script-quality-window">
            {t('settings.script.quality.window', {
              count: report.count,
              window: report.window,
            })}
          </p>
          <dl className="grid grid-cols-2 gap-2 text-xs">
            {STATS.map((stat) => (
              <div key={stat.field} className="rounded-md border bg-ui-row px-2.5 py-2">
                <dt className="text-muted-foreground">{t(stat.label)}</dt>
                <dd className="mt-0.5 font-medium" data-testid={`script-quality-${stat.field}`}>
                  {percent(report[stat.field])}
                </dd>
              </div>
            ))}
          </dl>
          <p className="text-xs text-muted-foreground" data-testid="script-quality-gate">
            {t('settings.script.quality.gate', {
              remaining: report.gate.budgetRemaining,
              perDay: report.gate.perDay,
              unplayed: report.gate.unplayedScenes,
            })}
            {' · '}
            {t('settings.script.quality.quiet')}
            {' '}
            {report.gate.quietHoursActive
              ? t('settings.script.quality.quietOn')
              : t('settings.script.quality.quietOff')}
            {' · '}
            {t('settings.script.quality.avgScore', { score: report.avgScore.toFixed(2) })}
          </p>
          {report.topReasons.length > 0 && (
            <div className="flex flex-wrap gap-1.5 text-xs text-muted-foreground">
              <span>{t('settings.script.quality.topReasons')}</span>
              {report.topReasons.map((reason) => (
                <span
                  key={reason.code}
                  className="rounded-full bg-muted px-1.5 py-0.5"
                  data-testid="script-quality-reason"
                >
                  {t(SCRIPT_REASON_LABELS[reason.code])} ×{reason.count}
                </span>
              ))}
            </div>
          )}
        </>
      ) : null}
    </section>
  );
}
