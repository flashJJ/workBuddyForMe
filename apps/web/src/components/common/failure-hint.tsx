'use client';

import { TriangleAlert } from 'lucide-react';
import type { TaskStopReason } from '@wbfm/shared/schemas';
import type { MessageKey } from '@wbfm/shared/i18n';
import { useI18n } from '@/lib/i18n/use-i18n';
import { useSystemText } from '@/lib/i18n/use-system-text';
import { cn } from '@/lib/utils';
import {
  classifyFailure,
  isFailureOutcome,
  type FailureReason,
  type RunOutcome,
} from '@/lib/runs/run-outcome';

const FAILURE_KEYS: Record<FailureReason, { why: MessageKey; next: MessageKey }> = {
  cancelled: { why: 'runs.failure.cancelled.why', next: 'runs.failure.cancelled.next' },
  max_steps: { why: 'runs.failure.max_steps.why', next: 'runs.failure.max_steps.next' },
  max_failures: { why: 'runs.failure.max_failures.why', next: 'runs.failure.max_failures.next' },
  budget_exceeded: {
    why: 'runs.failure.budget_exceeded.why',
    next: 'runs.failure.budget_exceeded.next',
  },
  breaker: { why: 'runs.failure.breaker.why', next: 'runs.failure.breaker.next' },
  interrupted: { why: 'runs.failure.interrupted.why', next: 'runs.failure.interrupted.next' },
  rejected: { why: 'runs.failure.rejected.why', next: 'runs.failure.rejected.next' },
  permission: { why: 'runs.failure.permission.why', next: 'runs.failure.permission.next' },
  auth: { why: 'runs.failure.auth.why', next: 'runs.failure.auth.next' },
  rate_limit: { why: 'runs.failure.rate_limit.why', next: 'runs.failure.rate_limit.next' },
  timeout: { why: 'runs.failure.timeout.why', next: 'runs.failure.timeout.next' },
  network: { why: 'runs.failure.network.why', next: 'runs.failure.network.next' },
  model: { why: 'runs.failure.model.why', next: 'runs.failure.model.next' },
  tool: { why: 'runs.failure.tool.why', next: 'runs.failure.tool.next' },
  node: { why: 'runs.failure.node.why', next: 'runs.failure.node.next' },
  unknown: { why: 'runs.failure.unknown.why', next: 'runs.failure.unknown.next' },
};

export interface FailureHintProps {
  outcome: RunOutcome;
  /** 原始错误文本（run.error.message / step.error / errorMessage） */
  rawError?: string | null;
  /** task 的 stopReason */
  stopReason?: TaskStopReason | null;
  /** 结构化错误码 */
  code?: string | null;
  /** 表格行内使用的单行紧凑样式 */
  compact?: boolean;
  className?: string;
}

/**
 * v2.4 M4 / P1-1：把原始 error 映射为「为什么失败 + 下一步」。
 * 只在失败类终态（failed / interrupted / budget_exceeded）渲染；原始错误折叠保留。
 */
export function FailureHint({
  outcome,
  rawError,
  stopReason,
  code,
  compact = false,
  className,
}: FailureHintProps) {
  const { t } = useI18n();
  const sys = useSystemText();
  if (!isFailureOutcome(outcome)) return null;

  const reason = classifyFailure({ outcome, stopReason, rawError, code });
  const keys = FAILURE_KEYS[reason];
  const why = t(keys.why);
  const next = t(keys.next);
  const raw = rawError ? sys(rawError) : '';

  if (compact) {
    return (
      <span
        className={cn('block min-w-0 text-[10px] leading-snug', className)}
        data-testid="failure-hint"
        data-reason={reason}
        title={raw || undefined}
      >
        <span className="text-destructive">{t('runs.hint.title', { reason: why })}</span>
        <span className="text-muted-foreground"> · {t('runs.hint.next', { action: next })}</span>
      </span>
    );
  }

  return (
    <div
      className={cn('rounded-md border border-destructive/30 bg-destructive/5 px-2 py-1.5', className)}
      data-testid="failure-hint"
      data-reason={reason}
    >
      <p className="flex items-start gap-1.5 text-[11px] font-medium text-destructive">
        <TriangleAlert className="mt-0.5 h-3 w-3 shrink-0" />
        <span className="min-w-0 break-words">{t('runs.hint.title', { reason: why })}</span>
      </p>
      <p className="mt-0.5 pl-[18px] text-[11px] text-muted-foreground">
        {t('runs.hint.next', { action: next })}
      </p>
      {raw && (
        <details className="mt-1 pl-[18px]">
          <summary className="cursor-pointer text-[10px] text-muted-foreground">
            {t('runs.hint.raw')}
          </summary>
          <p className="mt-0.5 whitespace-pre-wrap break-words font-mono text-[10px] text-muted-foreground">
            {raw}
          </p>
        </details>
      )}
    </div>
  );
}
