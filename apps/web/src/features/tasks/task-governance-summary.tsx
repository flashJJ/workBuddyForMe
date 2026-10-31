'use client';

import type {
  AgentPermissionMode,
  AuditDecision,
  AuditEventView,
  TaskRunView,
} from '@wbfm/shared/schemas';
import type { MessageKey } from '@wbfm/shared/i18n';
import { Badge } from '@/components/ui/badge';
import { useI18n } from '@/lib/i18n/use-i18n';
import { useTaskAudit } from '@/lib/hooks/use-tasks';
import { maskWorkspacePath } from '@/lib/utils/path-mask';

const MODE_KEYS: Record<AgentPermissionMode, MessageKey> = {
  confirm_each: 'tasks.governance.modes.confirm_each',
  auto_edits: 'tasks.governance.modes.auto_edits',
  smart_approve: 'tasks.governance.modes.smart_approve',
  plan_only: 'tasks.governance.modes.plan_only',
  full_access: 'tasks.governance.modes.full_access',
};

const DECISION_KEYS: Record<AuditDecision, MessageKey> = {
  allow: 'audit.decisions.allow',
  deny: 'audit.decisions.deny',
  ask: 'audit.decisions.ask',
};

const DECISION_VARIANT: Record<AuditDecision, 'success' | 'danger' | 'warning'> = {
  allow: 'success',
  deny: 'danger',
  ask: 'warning',
};

function AuditRow({ event }: { event: AuditEventView }) {
  const { t } = useI18n();
  return (
    <li
      className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground"
      data-testid={`task-audit-event-${event.seq}`}
    >
      <Badge variant="outline">#{event.seq}</Badge>
      <span className="text-foreground">{t(`audit.kinds.${event.kind}` as MessageKey)}</span>
      {event.decision && (
        <Badge variant={DECISION_VARIANT[event.decision]}>
          {t(DECISION_KEYS[event.decision])}
        </Badge>
      )}
      {event.tool && <span>{event.tool}</span>}
      <span>{new Date(event.createdAt).toLocaleString()}</span>
    </li>
  );
}

/** v2.14：任务详情治理摘要 + 最近 10 条关联审计事件（只读） */
export function TaskGovernanceSummary({ task }: { task: TaskRunView }) {
  const { t } = useI18n();
  const audit = useTaskAudit(task.id);
  const events = audit.data?.events ?? [];

  return (
    <div className="space-y-2" data-testid={`task-governance-${task.id}`}>
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
        <span>
          {t('tasks.governance.runMode')}：{t(MODE_KEYS[task.permissionMode])}
        </span>
        {task.workspacePath ? (
          <span className="min-w-0 truncate" title={task.workspacePath}>
            {t('tasks.governance.runWorkspace')}：{maskWorkspacePath(task.workspacePath)}
          </span>
        ) : null}
        <span>
          {t('tasks.governance.runPolicyHash')}：
          {task.policyHash ? (
            <code className="break-all" title={task.policyHash}>
              {task.policyHash.slice(0, 12)}…
            </code>
          ) : (
            t('tasks.governance.runPolicyHashNone')
          )}
        </span>
        {task.originScheduledTaskId && (
          <span>
            {t('tasks.governance.runOrigin')}：
            <code>{task.originScheduledTaskId}</code>
          </span>
        )}
      </div>

      <div className="space-y-1">
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs font-medium">{t('tasks.governance.recentAudit')}</p>
          <a
            href={`/audit?runId=${encodeURIComponent(task.id)}`}
            className="text-xs text-primary underline-offset-2 hover:underline"
            data-testid={`task-audit-link-${task.id}`}
          >
            {t('tasks.governance.viewAudit')}
          </a>
        </div>
        {audit.isLoading ? (
          <p className="text-xs text-muted-foreground">{t('common.actions.loading')}</p>
        ) : audit.isError ? (
          <p className="text-xs text-destructive">{t('tasks.governance.auditLoadFailed')}</p>
        ) : events.length === 0 ? (
          <p className="text-xs text-muted-foreground" data-testid={`task-audit-empty-${task.id}`}>
            {t('tasks.governance.auditEmpty')}
          </p>
        ) : (
          <ul className="space-y-1">
            {events.map((event) => (
              <AuditRow key={event.id} event={event} />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
