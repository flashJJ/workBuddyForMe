import type { OperationBinding, SubagentRunView } from '@wbfm/shared/schemas';
import type { AuditService } from '../governance/audit';
import { auditCritical } from '../governance/audit';

/**
 * v2.13 M3：外部代理治理事件集中落账本（外迁避免 run-service 撞行数门禁）。
 * 运行审批 / 权限帧 / 策略拒绝 / 绑定漂移；关键事件失败由调用方 fail-closed。
 */

function context(run: SubagentRunView, binding?: OperationBinding | null, policyHash?: string | null) {
  return {
    actor: 'agent' as const,
    tool: 'subagent',
    runId: run.id,
    conversationId: run.conversationId || null,
    ...(binding ? { binding } : {}),
    ...(policyHash ? { policyHash } : {}),
  };
}

export function recordSubagentPolicyDenied(
  audit: AuditService | undefined,
  run: SubagentRunView,
  reasonCode: string,
  message: string,
): void {
  auditCritical(audit, {
    ...context(run),
    kind: 'policy_denied',
    decision: 'deny',
    reasonCode,
    outcome: message,
  });
}

/** 运行审批登记；返回 false 表示账本不可用（调用方 fail-closed） */
export function recordSubagentApprovalRequested(
  audit: AuditService | undefined,
  run: SubagentRunView,
  binding: OperationBinding,
  policyHash: string,
): boolean {
  return auditCritical(audit, {
    ...context(run, binding, policyHash),
    kind: 'approval_requested',
    decision: 'ask',
    reasonCode: 'MODE_ASK',
  });
}

export function recordSubagentApprovalOutcome(
  audit: AuditService | undefined,
  run: SubagentRunView,
  binding: OperationBinding,
  policyHash: string,
  outcome: string,
): boolean {
  const kind =
    outcome === 'allow'
      ? 'approval_granted'
      : outcome === 'timeout'
        ? 'approval_timeout'
        : 'approval_denied';
  return auditCritical(audit, {
    ...context(run, binding, policyHash),
    kind,
    decision: outcome === 'allow' ? 'allow' : 'deny',
    reasonCode: outcome === 'timeout' ? 'APPROVAL_TIMEOUT' : null,
    outcome,
  });
}

export function recordSubagentPermissionRequested(
  audit: AuditService | undefined,
  run: SubagentRunView,
  frameId: string,
): void {
  auditCritical(audit, {
    ...context(run),
    kind: 'approval_requested',
    decision: 'ask',
    reasonCode: 'permission_frame',
    outcome: frameId,
  });
}

export function recordSubagentPermission(
  audit: AuditService | undefined,
  run: SubagentRunView,
  frameId: string,
  allowed: boolean,
): void {
  auditCritical(audit, {
    ...context(run),
    kind: allowed ? 'approval_granted' : 'approval_denied',
    decision: allowed ? 'allow' : 'deny',
    reasonCode: `permission_frame:${frameId}`,
    outcome: frameId,
  });
}

export function recordSubagentBindingDrift(
  audit: AuditService | undefined,
  run: SubagentRunView,
  binding: OperationBinding,
  policyHash: string,
  message: string,
): void {
  auditCritical(audit, {
    ...context(run, binding, policyHash),
    kind: 'binding_drift',
    decision: 'deny',
    reasonCode: 'APPROVAL_BINDING_DRIFT',
    outcome: message,
  });
}
