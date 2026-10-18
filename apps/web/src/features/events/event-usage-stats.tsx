'use client';

import * as React from 'react';
import type { EventUsageStatsView } from '@wbfm/shared/schemas';
import { apiGet } from '@/lib/api/client';
import { SimpleSelect } from '@/components/ui/simple-select';
import { useI18n } from '@/lib/i18n/use-i18n';
import { useAssistants } from '@/lib/hooks/use-assistants';

interface StatsShape extends EventUsageStatsView {
  windowDays: number;
}

/** 打断率 ≥ 该阈值时提示降低主动频率（只提示不自动改，负向北极星指标） */
const INTERRUPT_RATE_WARN = 0.2;
const WINDOW_DAYS = 30;

function percent(value: number | null): string {
  if (value === null) return '—';
  return `${Math.round(value * 100)}%`;
}

/**
 * v1.7 M5 打扰率本地统计（近 30 天，按助手）。
 * 接受率=played/(played+skipped+interrupted)；打断率过高给出降档建议。
 */
export function EventUsageStats() {
  const { t } = useI18n();
  const { data: assistantsRaw } = useAssistants();
  const assistants = Array.isArray(assistantsRaw) ? assistantsRaw : [];
  const [assistantId, setAssistantId] = React.useState('');
  const [stats, setStats] = React.useState<StatsShape | null>(null);

  React.useEffect(() => {
    if (!assistantId) return;
    let cancelled = false;
    apiGet<StatsShape>(
      `/api/events/usage/stats?assistantId=${encodeURIComponent(assistantId)}&windowDays=${WINDOW_DAYS}`,
    )
      .then((data) => {
        if (!cancelled) setStats(data);
      })
      .catch(() => {
        if (!cancelled) setStats(null);
      });
    return () => {
      cancelled = true;
    };
  }, [assistantId]);

  return (
    <div className="space-y-2 border-t pt-3" data-testid="event-usage-stats">
      <div className="flex items-center justify-between gap-3">
        <h4 className="text-sm font-medium">{t('eventStats.title')}</h4>
        <SimpleSelect
          className="rounded-md border bg-background px-2 py-1 text-xs"
          value={assistantId}
          aria-label={t('eventStats.selectAssistant')}
          data-testid="event-usage-assistant"
          onValueChange={(v) => setAssistantId(v)}
        >
          <option value="" disabled>
            {t('eventStats.selectAssistant')}
          </option>
          {(assistants ?? []).map((assistant) => (
            <option key={assistant.id} value={assistant.id}>
              {assistant.emoji ? `${assistant.emoji} ` : ''}
              {assistant.name}
            </option>
          ))}
        </SimpleSelect>
      </div>

      {assistantId && (
        <div className="space-y-1">
          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="rounded-md border py-1.5">
              <div className="text-sm font-medium tabular-nums">{stats?.played ?? 0}</div>
              <div className="text-[10px] text-muted-foreground">{t('eventStats.played')}</div>
            </div>
            <div className="rounded-md border py-1.5">
              <div className="text-sm font-medium tabular-nums">{percent(stats?.acceptRate ?? null)}</div>
              <div className="text-[10px] text-muted-foreground">{t('eventStats.acceptRate')}</div>
            </div>
            <div className="rounded-md border py-1.5">
              <div className="text-sm font-medium tabular-nums">
                {percent(stats?.interruptRate ?? null)}
              </div>
              <div className="text-[10px] text-muted-foreground">{t('eventStats.interruptRate')}</div>
            </div>
          </div>
          {stats && stats.played + stats.skipped + stats.interrupted === 0 && (
            <p className="text-[11px] text-muted-foreground">{t('eventStats.noData')}</p>
          )}
          {stats && (stats.interruptRate ?? 0) >= INTERRUPT_RATE_WARN && (
            <p
              className="rounded-md bg-amber-50 px-2 py-1 text-[11px] text-amber-800 dark:bg-amber-950 dark:text-amber-200"
              data-testid="event-usage-downgrade-hint"
            >
              {t('eventStats.downgradeHint')}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
