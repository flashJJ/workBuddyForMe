'use client';

import * as React from 'react';
import { ChevronRight, Info } from 'lucide-react';
import type { Message } from '@wbfm/shared/types';
import { useI18n } from '@/lib/i18n/use-i18n';
import { cn } from '@/lib/utils';
import { traceState } from '../../base/tool-trace-state';

/** 与工具时间线一致的耗时展示（毫秒内保留 ms，其余保留一位小数秒） */
function formatDuration(ms: number): string {
  return ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(1)}s`;
}

/**
 * v2.27：回合运行摘要条。
 * 只聚合已有字段（toolTrace / totalTokens / citations）：工具次数与成败、
 * 工具耗时、引用条数与来源类型；展开后显示 token 与逐工具耗时。
 * 无工具且无引用的纯对话不渲染（沿用 v2.23 的 token 行）。
 */
export function TurnSummary({ message }: { message: Message }) {
  const { t } = useI18n();
  const [open, setOpen] = React.useState(false);
  if (message.status !== 'completed') return null;

  const trace = message.toolTrace;
  const citations = message.citations;
  if (trace.length === 0 && citations.length === 0) return null;

  const okCount = trace.filter((entry) => traceState(entry) === 'ok').length;
  const failedCount = trace.filter((entry) => {
    const state = traceState(entry);
    return state === 'failed' || state === 'denied' || state === 'breaker';
  }).length;
  const toolMs = trace.reduce((sum, entry) => sum + (entry.durationMs || 0), 0);
  const docCount = citations.filter((citation) => !citation.sourceUrl).length;
  const webCount = citations.length - docCount;

  const parts: string[] = [];
  if (trace.length > 0) {
    parts.push(
      t('chatMessages.turnSummaryTools', {
        count: trace.length,
        ok: okCount,
        failed: failedCount,
      }),
      t('chatMessages.turnSummaryDuration', { duration: formatDuration(toolMs) }),
    );
  }
  if (citations.length > 0) {
    const sources: string[] = [];
    if (docCount > 0) sources.push(t('chatMessages.turnSummarySourceKnowledge'));
    if (webCount > 0) sources.push(t('chatMessages.turnSummarySourceWeb'));
    parts.push(
      `${t('chatMessages.turnSummaryCitations', { count: citations.length })} · ${sources.join(' + ')}`,
    );
  }

  return (
    <div className="text-[11px] text-muted-foreground/80" data-testid="turn-summary">
      <button
        type="button"
        data-testid="turn-summary-toggle"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className="flex max-w-full items-center gap-1 text-left transition-colors hover:text-foreground"
      >
        <Info className="h-3 w-3 shrink-0" aria-hidden />
        <span className="min-w-0 truncate">{parts.join(' · ')}</span>
        <ChevronRight
          className={cn('h-3 w-3 shrink-0 transition-transform', open && 'rotate-90')}
          aria-hidden
        />
      </button>
      {open && (
        <div
          className="mt-1 space-y-0.5 border-l pl-2 text-muted-foreground/80"
          data-testid="turn-summary-detail"
        >
          {(message.totalTokens ?? 0) > 0 && (
            <p>
              {t('chatMessages.turnSummaryTokens', {
                prompt: message.promptTokens ?? 0,
                completion: message.completionTokens ?? 0,
              })}
            </p>
          )}
          {trace.length > 0 && (
            <>
              <p className="font-medium">{t('chatMessages.turnSummaryToolsDetail')}</p>
              <ul className="space-y-0.5">
                {trace.map((entry) => (
                  <li
                    key={entry.callId}
                    data-testid="turn-summary-tool"
                    className={cn(
                      'flex items-center gap-1 tabular-nums',
                      traceState(entry) === 'ok' ? '' : 'text-destructive',
                    )}
                    title={entry.error}
                  >
                    <span className="min-w-0 truncate">{entry.tool}</span>
                    <span className="text-muted-foreground/60">·</span>
                    <span>{formatDuration(entry.durationMs || 0)}</span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}
    </div>
  );
}
