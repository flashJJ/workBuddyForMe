'use client';

import * as React from 'react';
import { useMemoryExplain } from '@/lib/hooks/assistant';
import { useI18n } from '@/lib/i18n/use-i18n';
import { formatMemoryDate } from '../memory-labels';

/** v4.21：最近召回解释（只读元数据，不展示正文与查询原文） */
export function MemoryRecallTrace() {
  const { t, locale } = useI18n();
  const { data, isLoading, isError } = useMemoryExplain();
  const traces = data?.traces ?? [];

  return (
    <div className="rounded-lg border bg-muted/20 p-3" data-testid="memory-recall-trace">
      <h3 className="text-sm font-medium">{t('memory.trace.title')}</h3>
      <p className="text-xs text-muted-foreground">{t('memory.trace.description')}</p>
      {isLoading ? (
        <p className="mt-2 text-xs text-muted-foreground">{t('memory.trace.empty')}</p>
      ) : isError ? (
        <p className="mt-2 text-xs text-destructive">{t('memory.stats.loadFailed')}</p>
      ) : traces.length === 0 ? (
        <p className="mt-2 text-xs text-muted-foreground">{t('memory.trace.empty')}</p>
      ) : (
        <ul className="mt-2 space-y-1">
          {traces.map((trace, index) => (
            <li
              key={`${trace.at}-${index}`}
              className="rounded-md bg-ui-row px-2 py-1.5 text-xs text-muted-foreground"
              data-testid="memory-recall-trace-item"
            >
              <p className="text-foreground">
                {t('memory.trace.line', {
                  scene: t(`memory.trace.scene.${trace.scene}`),
                  time: formatMemoryDate(trace.at, locale),
                  selected: trace.selected,
                  candidates: trace.candidates,
                })}
              </p>
              <p>
                {t('memory.trace.channels', {
                  semantic: trace.channels.semantic,
                  lexical: trace.channels.lexical,
                  pinned: trace.channels.pinned,
                  neighbor: trace.channels.neighbor,
                })}
              </p>
              <p>
                {t('memory.trace.dropped', {
                  byScore: trace.dropped.byScore,
                  byBudget: trace.dropped.byBudget,
                  byConflict: trace.dropped.byConflict,
                })}
              </p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
