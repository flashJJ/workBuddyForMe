'use client';

import * as React from 'react';
import type { Language } from '@wbfm/shared/constants';
import type { MemoryAuditEntry, MemoryLifecycleStats } from '@wbfm/shared/types';
import { Button } from '@/components/ui/button';
import { ErrorState, Skeleton } from '@/components/common/state';
import { useMemoryStats } from '@/lib/hooks/assistant';
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
 * v2.28 P0：记忆统计卡（只读）。
 * 直接展示后端 /api/memories/stats 口径，前端只做格式化，不重算比例。
 */
export function MemoryStatsCard() {
  const { t, locale } = useI18n();
  const { data: stats, isLoading, isError, refetch } = useMemoryStats();
  // 查询态在 SSR 与客户端首帧不一致，直接据此切结构会水合失配（React #418/#422）。
  const [mounted, setMounted] = React.useState(false);
  React.useEffect(() => setMounted(true), []);

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
        <StatsBody stats={stats} locale={locale} />
      )}
    </div>
  );
}

function StatsBody({ stats, locale }: { stats: MemoryLifecycleStats; locale: Language }) {
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
    </>
  );
}
