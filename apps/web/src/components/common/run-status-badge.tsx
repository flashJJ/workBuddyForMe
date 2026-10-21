'use client';

import { Loader2 } from 'lucide-react';
import type { TaskStopReason } from '@wbfm/shared/schemas';
import { Badge } from '@/components/ui/badge';
import { useI18n } from '@/lib/i18n/use-i18n';
import { cn } from '@/lib/utils';
import {
  RUN_OUTCOME_LABEL_KEYS,
  toOutcome,
  type RunKind,
  type RunOutcome,
} from '@/lib/runs/run-outcome';

type BadgeVariant = 'default' | 'success' | 'warning' | 'danger' | 'info' | 'outline';

const OUTCOME_VARIANT: Record<RunOutcome, BadgeVariant> = {
  queued: 'outline',
  running: 'default',
  waiting: 'warning',
  succeeded: 'success',
  failed: 'danger',
  cancelled: 'outline',
  interrupted: 'danger',
  budget_exceeded: 'warning',
};

/**
 * v2.4 M4 / P1-1：三条链路（task / agent-run / flow-run）共用的状态徽标。
 * 传入各自原始 status 与 task 的 stopReason，由 run-outcome 归一后渲染。
 */
export function RunStatusBadge({
  kind,
  status,
  stopReason,
  className,
}: {
  kind: RunKind;
  status: string;
  stopReason?: TaskStopReason | null;
  className?: string;
}) {
  const { t } = useI18n();
  const outcome = toOutcome(kind, status, stopReason);
  const labelKey = RUN_OUTCOME_LABEL_KEYS[outcome];
  return (
    <Badge
      variant={OUTCOME_VARIANT[outcome]}
      className={cn('gap-1', className)}
      data-run-outcome={outcome}
      title={t(labelKey)}
    >
      {outcome === 'running' && <Loader2 className="h-3 w-3 animate-spin" />}
      {t(labelKey)}
    </Badge>
  );
}
