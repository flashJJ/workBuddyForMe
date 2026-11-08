'use client';

import * as React from 'react';
import {
  MEMORY_EVENT_RETENTION_DAYS,
  MEMORY_EVENT_RETENTION_DEFAULT_DAYS,
  type Language,
} from '@wbfm/shared/constants';
import type { MemoryAuditEntry, MemoryLifecycleStats } from '@wbfm/shared/types';
import { Button } from '@/components/ui/button';
import { SimpleSelect } from '@/components/ui/simple-select';
import { ErrorState, Skeleton } from '@/components/common/state';
import { useToast } from '@/components/common/toast';
import { useMemoryStats } from '@/lib/hooks/assistant';
import { useSettings, useUpdateSettings } from '@/lib/hooks/provider';
import { useI18n } from '@/lib/i18n/use-i18n';
import { formatNumber } from '@/lib/i18n/intl';
import {
  formatMemoryDate,
  formatStatsPercent,
  memoryAuditActionKey,
  memoryAuditActorKey,
} from './memory-labels';

function AuditRow({ entry }: { entry: MemoryAuditEntry }) {
  const { t, locale } = useI18n();
  return (
    <li className="truncate text-xs text-muted-foreground" data-testid="memory-audit-item">
      {t('memory.stats.auditLine', {
        action: t(memoryAuditActionKey(entry.action)),
        actor: t(memoryAuditActorKey(entry.actor)),
        date: formatMemoryDate(entry.createdAt, locale),
      })}
    </li>
  );
}

/**
 * v2.28 P0/P1：记忆统计卡。
 * 直接展示后端 /api/memories/stats 口径，前端只做格式化，不重算比例；
 * 底部提供审计保留期配置与最近一次轮转时间。
 */
export function MemoryStatsCard() {
  const { t, locale } = useI18n();
  const { data: stats, isLoading, isError, refetch } = useMemoryStats();
  const { data: settings } = useSettings();
  const updateSettings = useUpdateSettings();
  const toast = useToast();
  // 查询态在 SSR 与客户端首帧不一致，直接据此切结构会水合失配（React #418/#422）。
  const [mounted, setMounted] = React.useState(false);
  React.useEffect(() => setMounted(true), []);

  const retention =
    settings?.memoryEventRetentionDays ?? MEMORY_EVENT_RETENTION_DEFAULT_DAYS;
  const changeRetention = async (value: number) => {
    try {
      await updateSettings.mutateAsync({ memoryEventRetentionDays: value });
    } catch {
      toast.error(t('memory.stats.retentionSaveFailed'));
    }
  };

  return (
    <div className="rounded-lg border bg-muted/20 p-3" data-testid="memory-stats-card">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="text-sm font-medium">{t('memory.stats.title')}</h3>
          <p className="text-xs text-muted-foreground">{t('memory.stats.description')}</p>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          data-testid="memory-stats-refresh"
          onClick={() => void refetch()}
        >
          {t('memory.stats.refresh')}
        </Button>
      </div>

      {mounted && isLoading && (
        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {Array.from({ length: 7 }, (_, index) => (
            <Skeleton key={index} className="h-12" />
          ))}
        </div>
      )}
      {mounted && isError && (
        <ErrorState message={t('memory.stats.loadFailed')} onRetry={() => void refetch()} />
      )}
      {mounted && !isLoading && !isError && stats && (
        <StatsBody
          stats={stats}
          locale={locale}
          retention={retention}
          retentionDisabled={!settings}
          onRetentionChange={(value) => void changeRetention(value)}
        />
      )}
    </div>
  );
}

function StatsBody({
  stats,
  locale,
  retention,
  retentionDisabled,
  onRetentionChange,
}: {
  stats: MemoryLifecycleStats;
  locale: Language;
  retention: number;
  retentionDisabled: boolean;
  onRetentionChange: (value: number) => void;
}) {
  const { t } = useI18n();
  const metrics = [
    { key: 'total', label: t('memory.stats.total'), value: formatNumber(stats.total, locale) },
    { key: 'active', label: t('memory.stats.active'), value: formatNumber(stats.active, locale) },
    { key: 'archived', label: t('memory.stats.archived'), value: formatNumber(stats.archived, locale) },
    {
      key: 'supersededRatio',
      label: t('memory.stats.supersededRatio'),
      value: formatStatsPercent(stats.supersededRatio, locale),
    },
    {
      key: 'zeroRecallRate',
      label: t('memory.stats.zeroRecallRate'),
      value: formatStatsPercent(stats.zeroRecallRate, locale),
    },
    {
      key: 'recallTotal',
      label: t('memory.stats.recallTotal'),
      value: formatNumber(stats.recallTotal, locale),
    },
    {
      key: 'userCorrections',
      label: t('memory.stats.userCorrections'),
      value: formatNumber(stats.userCorrections, locale),
    },
  ];
  const recent = stats.recentEvents ?? [];

  return (
    <>
      <dl className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {metrics.map((metric) => (
          <div
            key={metric.key}
            className="rounded-md bg-background/60 px-2 py-1.5"
            data-testid={`memory-stat-${metric.key}`}
          >
            <dt className="text-xs text-muted-foreground">{metric.label}</dt>
            <dd className="text-sm font-semibold">{metric.value}</dd>
          </div>
        ))}
      </dl>
      <div className="mt-3">
        <p className="text-xs font-medium">{t('memory.stats.recentTitle')}</p>
        {recent.length === 0 ? (
          <p className="text-xs text-muted-foreground">{t('memory.stats.auditEmpty')}</p>
        ) : (
          <ul className="mt-1 space-y-0.5">
            {recent.map((entry) => (
              <AuditRow key={entry.id} entry={entry} />
            ))}
          </ul>
        )}
      </div>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t pt-2">
        <label className="flex items-center gap-2 text-xs text-muted-foreground">
          {t('memory.stats.retentionLabel')}
          <SimpleSelect
            aria-label={t('memory.stats.retentionLabel')}
            className="h-8 w-24"
            value={String(retention)}
            disabled={retentionDisabled}
            onValueChange={(value) => onRetentionChange(Number(value))}
          >
            {MEMORY_EVENT_RETENTION_DAYS.map((days) => (
              <option key={days} value={String(days)}>
                {days === 0
                  ? t('memory.stats.retentionForever')
                  : t('memory.stats.retentionDays', { days })}
              </option>
            ))}
          </SimpleSelect>
        </label>
        <span className="text-xs text-muted-foreground" data-testid="memory-last-rollup">
          {stats.lastRollupAt
            ? t('memory.stats.lastRollup', {
                date: formatMemoryDate(stats.lastRollupAt, locale),
              })
            : t('memory.stats.neverRolledUp')}
        </span>
      </div>
    </>
  );
}
