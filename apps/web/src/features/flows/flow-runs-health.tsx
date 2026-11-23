'use client';

import type { FlowRuntimeHealthView } from '@wbfm/shared/types';
import { useI18n } from '@/lib/i18n/use-i18n';

/** v5.0 运行健康抽屉：只读展示调度/文件/补偿/端点/保留状态 */
export function FlowRunsHealth({ health }: { health: FlowRuntimeHealthView | undefined }) {
  const { t } = useI18n();
  if (!health) {
    return <p className="px-3 py-2 text-[11px] text-muted-foreground">{t('flowRuns.health.loading')}</p>;
  }
  return (
    <div className="grid gap-3 px-3 py-3 text-[11px] sm:grid-cols-2 lg:grid-cols-4">
      <section className="rounded-md border bg-ui-card p-2.5">
        <h4 className="mb-1 font-medium">{t('flowRuns.health.scheduler')}</h4>
        <p className={health.scheduler.stalled ? 'text-destructive' : 'text-muted-foreground'}>
          {health.scheduler.stalled
            ? t('flowRuns.health.stalled')
            : t('flowRuns.health.ticks', { count: health.scheduler.tickCount })}
        </p>
        {health.scheduler.lastError && (
          <p className="mt-1 truncate text-destructive" title={health.scheduler.lastError}>
            {health.scheduler.lastError}
          </p>
        )}
      </section>
      <section className="rounded-md border bg-ui-card p-2.5">
        <h4 className="mb-1 font-medium">{t('flowRuns.health.fileWatcher')}</h4>
        <p className="text-muted-foreground">
          {health.fileWatcher.active
            ? t('flowRuns.health.watching', { count: health.fileWatcher.watchingCount })
            : t('flowRuns.health.inactive')}
        </p>
        {health.fileWatcher.lastError && (
          <p className="mt-1 truncate text-destructive" title={health.fileWatcher.lastError}>
            {health.fileWatcher.lastError}
          </p>
        )}
      </section>
      <section className="rounded-md border bg-ui-card p-2.5">
        <h4 className="mb-1 font-medium">{t('flowRuns.health.compensation')}</h4>
        <p className="text-muted-foreground">
          {t('flowRuns.compensation.pending')}: {health.compensation.pending} ·{' '}
          {t('flowRuns.compensation.exhausted')}: {health.compensation.exhausted}
        </p>
      </section>
      <section className="rounded-md border bg-ui-card p-2.5">
        <h4 className="mb-1 font-medium">{t('flowRuns.health.retention')}</h4>
        <p className="text-muted-foreground">
          {t('flowRuns.health.removed', { count: health.retention.removedTotal })}
        </p>
      </section>
      {health.schedules.length > 0 && (
        <section className="rounded-md border bg-ui-card p-2.5 sm:col-span-2">
          <h4 className="mb-1 font-medium">{t('flowRuns.health.schedules')}</h4>
          <ul className="space-y-1 text-muted-foreground">
            {health.schedules.slice(0, 6).map((item) => (
              <li key={item.scheduleId} className="flex justify-between gap-2">
                <span className="truncate">{item.name || item.cron}</span>
                <span className="shrink-0">
                  {item.missedCount > 0
                    ? t('flowRuns.health.missed', { count: item.missedCount })
                    : item.lastStatus ?? '—'}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
      {health.triggers.length > 0 && (
        <section className="rounded-md border bg-ui-card p-2.5 sm:col-span-2">
          <h4 className="mb-1 font-medium">{t('flowRuns.health.triggers')}</h4>
          <ul className="space-y-1 text-muted-foreground">
            {health.triggers.slice(0, 6).map((item) => (
              <li key={item.triggerId} className="flex justify-between gap-2">
                <span className="truncate">
                  {item.kind} · {item.name || item.triggerId}
                </span>
                <span className="shrink-0">{item.lastStatus ?? t('flowRuns.health.never')}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
