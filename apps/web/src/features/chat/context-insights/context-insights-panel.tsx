'use client';

import * as React from 'react';
import { RefreshCw, Shrink, X } from 'lucide-react';
import type { MessageKey } from '@wbfm/shared/i18n';
import type {
  CondensationTrigger,
  TurnIntentKind,
  TurnIntentSource,
} from '@wbfm/shared/schemas';
import { Button } from '@/components/ui/button';
import { EmptyState, ErrorState, Spinner } from '@/components/common/state';
import { useToast } from '@/components/common/toast';
import { apiPost } from '@/lib/api/client';
import { API } from '@/lib/api/endpoints';
import { useI18n } from '@/lib/i18n/use-i18n';
import { useContextInsights } from './use-context-insights';

const KIND_KEY: Record<TurnIntentKind, MessageKey> = {
  chitchat: 'contextInsights.kinds.chitchat',
  knowledge: 'contextInsights.kinds.knowledge',
  follow_up: 'contextInsights.kinds.follow_up',
  tool_task: 'contextInsights.kinds.tool_task',
  clarify: 'contextInsights.kinds.clarify',
  memory_write: 'contextInsights.kinds.memory_write',
  reminder: 'contextInsights.kinds.reminder',
};

const SOURCE_KEY: Record<TurnIntentSource, MessageKey> = {
  rule: 'contextInsights.sources.rule',
  classifier: 'contextInsights.sources.classifier',
  fallback: 'contextInsights.sources.fallback',
};

const TRIGGER_KEY: Record<CondensationTrigger, MessageKey> = {
  threshold: 'contextInsights.triggers.threshold',
  preflight: 'contextInsights.triggers.preflight',
  model_change: 'contextInsights.triggers.model_change',
  user_explicit: 'contextInsights.triggers.user_explicit',
};

function percent(value: number, total: number): number {
  if (total <= 0) return 0;
  return Math.min(100, Math.max(0, Math.round((value / total) * 100)));
}

function MetricRow({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-2 text-xs">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-mono tabular-nums">
        {value}
        {hint ? <span className="ml-1 text-[10px] text-muted-foreground">{hint}</span> : null}
      </span>
    </div>
  );
}

function Bar({ ratio }: { ratio: number }) {
  return (
    <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-muted">
      <div className="h-full rounded-full bg-primary" style={{ width: `${ratio}%` }} />
    </div>
  );
}

/** v4.8：上下文构成抽屉——最近意图、装配快照与压缩历史 */
export function ContextInsightsPanel({
  conversationId,
  onClose,
}: {
  conversationId: string | null;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const toast = useToast();
  const { insights, isLoading, isError, refetch } = useContextInsights(conversationId);
  const [compacting, setCompacting] = React.useState(false);
  const { intent, snapshot, compactions } = insights;
  const empty = !intent && !snapshot && compactions.length === 0;

  const compactNow = async () => {
    if (!conversationId || compacting) return;
    setCompacting(true);
    try {
      const result = await apiPost<{ compactedTurns: number }>(
        API.conversationCompact(conversationId),
      );
      toast.success(
        result.compactedTurns > 0
          ? t('contextInsights.manualCompactDone', { count: result.compactedTurns })
          : t('contextInsights.manualCompactNone'),
      );
      refetch();
    } catch {
      toast.error(t('contextInsights.manualCompactFailed'));
    } finally {
      setCompacting(false);
    }
  };

  return (
    <div className="flex h-full flex-col bg-ui-overlay" data-testid="context-insights-panel">
      <div className="flex items-center gap-2 border-b px-3 py-2">
        <h3 className="text-sm font-medium">{t('contextInsights.title')}</h3>
        <div className="ml-auto flex items-center gap-1">
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="h-7 w-7"
            disabled={!conversationId || compacting}
            aria-label={t('contextInsights.manualCompact')}
            title={t('contextInsights.manualCompact')}
            onClick={() => void compactNow()}
            data-testid="context-insights-compact"
          >
            <Shrink className="h-3.5 w-3.5" />
          </Button>
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="h-7 w-7"
            aria-label={t('contextInsights.refresh')}
            title={t('contextInsights.refresh')}
            onClick={refetch}
          >
            <RefreshCw className="h-3.5 w-3.5" />
          </Button>
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="h-7 w-7"
            aria-label={t('contextInsights.close')}
            title={t('contextInsights.close')}
            onClick={onClose}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3">
        {isLoading ? <Spinner /> : null}
        {isError ? <ErrorState message={t('contextInsights.error')} /> : null}
        {!isLoading && !isError && empty ? (
          <EmptyState title={t('contextInsights.empty')} />
        ) : null}

        {intent ? (
          <section className="rounded-md border bg-ui-row p-2.5" data-testid="context-insight-intent">
            <p className="text-[10px] font-semibold text-muted-foreground">
              {t('contextInsights.intent')}
            </p>
            <p className="mt-1 text-sm font-medium">
              {t('contextInsights.intentValue', {
                kind: t(KIND_KEY[intent.value.kind]),
                confidence: Math.round(intent.value.confidence * 100),
              })}
            </p>
            <p className="mt-0.5 text-[11px] text-muted-foreground">
              {t('contextInsights.intentSource', { source: t(SOURCE_KEY[intent.value.source]) })}
            </p>
            {intent.value.signals.length > 0 ? (
              <p className="mt-0.5 break-words text-[11px] text-muted-foreground">
                {t('contextInsights.signals', { signals: intent.value.signals.join('、') })}
              </p>
            ) : null}
            {intent.value.suggestedTaskMode ? (
              <p className="mt-0.5 text-[11px] text-muted-foreground" data-testid="context-insight-task-mode">
                {t('contextInsights.taskModeSuggestion')}
              </p>
            ) : null}
            {typeof intent.value.hintApplied === 'boolean' ? (
              <p className="mt-0.5 text-[11px] text-muted-foreground" data-testid="context-insight-hint">
                {t(
                  intent.value.hintApplied
                    ? 'contextInsights.hintApplied'
                    : 'contextInsights.hintSkipped',
                )}
              </p>
            ) : null}
          </section>
        ) : null}

        {snapshot ? (
          <section className="rounded-md border bg-ui-row p-2.5" data-testid="context-insight-snapshot">
            <p className="mb-1.5 text-[10px] font-semibold text-muted-foreground">
              {t('contextInsights.snapshot')}
            </p>
            <MetricRow label={t('contextInsights.window')} value={String(snapshot.value.contextWindow)} />
            <MetricRow label={t('contextInsights.usable')} value={String(snapshot.value.usableWindow)} />
            <MetricRow label={t('contextInsights.system')} value={String(snapshot.value.systemTokens)} />
            <MetricRow label={t('contextInsights.tools')} value={String(snapshot.value.toolsTokens)} />
            <MetricRow label={t('contextInsights.reserve')} value={String(snapshot.value.reserveTokens)} />
            <div className="mt-1">
              <MetricRow
                label={t('contextInsights.history')}
                value={t('contextInsights.historyValue', {
                  used: snapshot.value.historyTokens,
                  budget: snapshot.value.historyBudget,
                })}
              />
              <Bar ratio={percent(snapshot.value.historyTokens, snapshot.value.historyBudget)} />
              <p className="mt-1 text-[10px] text-muted-foreground">
                {t('contextInsights.kept', {
                  kept: snapshot.value.keptMessages,
                  dropped: snapshot.value.droppedMessages,
                })}
              </p>
            </div>
          </section>
        ) : null}

        <section className="rounded-md border bg-ui-row p-2.5" data-testid="context-insight-compactions">
          <p className="mb-1.5 text-[10px] font-semibold text-muted-foreground">
            {t('contextInsights.compactions')}
          </p>
          {compactions.length === 0 ? (
            <p className="text-[11px] text-muted-foreground">{t('contextInsights.noCompactions')}</p>
          ) : (
            <ol className="space-y-1.5">
              {compactions.map((entry) => (
                <li key={entry.id} className="text-[11px]">
                  <p className="font-mono tabular-nums">
                    {t('contextInsights.compactionValue', {
                      trigger: t(TRIGGER_KEY[entry.value.trigger]),
                      before: entry.value.beforeTokens,
                      after: entry.value.afterTokens,
                    })}
                  </p>
                  <p className="text-[10px] text-muted-foreground">
                    {t('contextInsights.folded', { count: entry.value.foldedMessageIds.length })}
                    {entry.value.degraded ? ` · ${t('contextInsights.degraded')}` : ''}
                  </p>
                </li>
              ))}
            </ol>
          )}
        </section>
      </div>
    </div>
  );
}
