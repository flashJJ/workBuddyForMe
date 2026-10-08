'use client';

import { Badge } from '@/components/ui/badge';
import type { TaskRunStatus, TaskStepKind, TaskStepStatus } from '@wbfm/shared/schemas';

const RUN_STATUS_META: Record<TaskRunStatus, { label: string; variant: 'default' | 'success' | 'warning' | 'danger' | 'outline' }> = {
  queued: { label: '排队', variant: 'outline' },
  running: { label: '运行中', variant: 'default' },
  paused: { label: '已暂停', variant: 'warning' },
  stopped: { label: '已终止', variant: 'warning' },
  completed: { label: '已完成', variant: 'success' },
  failed: { label: '已失败', variant: 'danger' },
};

export function TaskRunStatusBadge({ status }: { status: TaskRunStatus }) {
  const meta = RUN_STATUS_META[status];
  return <Badge variant={meta.variant}>{meta.label}</Badge>;
}

const STEP_KIND_LABEL: Record<TaskStepKind, string> = {
  observe: '观察',
  action: '执行',
  final: '终态',
};

const STEP_STATUS_VARIANT: Record<TaskStepStatus, 'default' | 'success' | 'warning' | 'danger' | 'outline'> = {
  running: 'default',
  completed: 'success',
  failed: 'danger',
};

export function TaskStepStatusBadge({ kind, status }: { kind: TaskStepKind; status: TaskStepStatus }) {
  return (
    <span className="inline-flex items-center gap-2 text-xs">
      <Badge variant="outline">{STEP_KIND_LABEL[kind]}</Badge>
      <Badge variant={STEP_STATUS_VARIANT[status]}>
        {status === 'running' ? '进行中' : status === 'completed' ? '完成' : '失败'}
      </Badge>
    </span>
  );
}
