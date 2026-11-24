import type { MessageKey } from '@wbfm/shared/i18n';
import type { AuditEventKind } from '@wbfm/shared/schemas';

/** v5.0：审计事件类型 → i18n key（拆出以控页面行数） */
export const AUDIT_KIND_KEYS: Record<AuditEventKind, MessageKey> = {
  policy_updated: 'audit.kinds.policy_updated',
  policy_denied: 'audit.kinds.policy_denied',
  approval_requested: 'audit.kinds.approval_requested',
  approval_granted: 'audit.kinds.approval_granted',
  approval_denied: 'audit.kinds.approval_denied',
  approval_timeout: 'audit.kinds.approval_timeout',
  binding_drift: 'audit.kinds.binding_drift',
  run_started: 'audit.kinds.run_started',
  run_finished: 'audit.kinds.run_finished',
  scheduled_run_started: 'audit.kinds.scheduled_run_started',
  scheduled_run_finished: 'audit.kinds.scheduled_run_finished',
  unattended_blocked: 'audit.kinds.unattended_blocked',
  skill_version_deleted: 'audit.kinds.skill_version_deleted',
  secrets_rotated: 'audit.kinds.secrets_rotated',
  audit_verified: 'audit.kinds.audit_verified',
  flow_compensation_scheduled: 'audit.kinds.flow_compensation_scheduled',
  flow_compensation_exhausted: 'audit.kinds.flow_compensation_exhausted',
  flow_retention_cleanup: 'audit.kinds.flow_retention_cleanup',
  flow_agent_tool_denied: 'audit.kinds.flow_agent_tool_denied',
  workspace_roots_updated: 'audit.kinds.workspace_roots_updated',
  file_path_denied: 'audit.kinds.file_path_denied',
  file_snapshot_created: 'audit.kinds.file_snapshot_created',
  file_rollback_applied: 'audit.kinds.file_rollback_applied',
  file_snapshot_cleanup: 'audit.kinds.file_snapshot_cleanup',
};
