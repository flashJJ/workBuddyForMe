'use client';

import type { MessageKey } from '@wbfm/shared/i18n';
import { Badge } from '@/components/ui/badge';
import type { TaskStepKind, TaskStepStatus } from '@wbfm/shared/schemas';
import { useI18n } from '@/lib/i18n/use-i18n';

const STEP_KIND_KEYS: Record<TaskStepKind, MessageKey> = {
  observe: 'tasks.stepKind.observe',
  action: 'tasks.stepKind.action',
  final: 'tasks.stepKind.final',
};

const STEP_STATUS_VARIANT: Record<TaskStepStatus, 'default' | 'success' | 'warning' | 'danger' | 'outline'> = {
  running: 'default',
  completed: 'success',
  failed: 'danger',
};

const STEP_STATUS_KEYS: Record<TaskStepStatus, MessageKey> = {
  running: 'tasks.stepStatus.running',
  completed: 'tasks.stepStatus.completed',
  failed: 'tasks.stepStatus.failed',
};

export function TaskStepStatusBadge({ kind, status }: { kind: TaskStepKind; status: TaskStepStatus }) {
  const { t } = useI18n();
  return (
    <span className="inline-flex items-center gap-2 text-xs">
      <Badge variant="outline">{t(STEP_KIND_KEYS[kind])}</Badge>
      <Badge variant={STEP_STATUS_VARIANT[status]}>{t(STEP_STATUS_KEYS[status])}</Badge>
    </span>
  );
}
