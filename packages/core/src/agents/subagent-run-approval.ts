import type { AppSettings } from '@wbfm/shared/types';
import type { SubagentRunView } from '@wbfm/shared/schemas';
import type { AuditService } from '../governance/audit';
import { summarizeBinding } from '../governance';
import type { ApprovalRegistry } from '../work-signal/approval-registry';
import { waitForRunApproval } from './subagent-approval';
import { buildSubagentGovernance, checkSubagentBinding } from './subagent-governance';
import {
  recordSubagentApprovalOutcome,
  recordSubagentApprovalRequested,
  recordSubagentBindingDrift,
  recordSubagentPolicyDenied,
} from './subagent-audit';

/**
 * v2.13 M3：外部代理运行前的治理序列（外迁守住 run-service 行数门禁）：
 * 策略 / 命令校验 → 审批登记审计 → 等待结果 → 结果审计 → 绑定重算。
 * 任一步失败返回结构化错误，由调用方收敛为 cancelled。
 */

export type SubagentAuthorization =
  | { ok: true }
  | { ok: false; errorCode: string; error: string };

export interface SubagentApprovalInput {
  run: SubagentRunView;
  cwd: string;
  approvals: ApprovalRegistry;
  settings: { get(): AppSettings };
  audit?: AuditService;
  timeoutMs: number;
  isCancelled: () => boolean;
}

function denied(errorCode: string, error: string): SubagentAuthorization {
  return { ok: false, errorCode, error };
}

export async function authorizeSubagentRun(
  input: SubagentApprovalInput,
): Promise<SubagentAuthorization> {
  const governance = buildSubagentGovernance(input.settings.get(), input.cwd);
  if (!governance.ok) {
    recordSubagentPolicyDenied(input.audit, input.run, governance.errorCode, governance.error);
    return denied(governance.errorCode, governance.error);
  }

  if (
    !recordSubagentApprovalRequested(
      input.audit,
      input.run,
      governance.binding,
      governance.policyHash,
    )
  ) {
    return denied('audit_unavailable', '审计账本不可用（AUDIT_UNAVAILABLE）');
  }

  const decision = await waitForRunApproval(
    input.approvals,
    {
      run: input.run,
      timeoutMs: input.timeoutMs,
      isCancelled: input.isCancelled,
    },
    summarizeBinding(governance.binding, input.run.goal),
    'MODE_ASK',
  );
  const outcomeAudited = recordSubagentApprovalOutcome(
    input.audit,
    input.run,
    governance.binding,
    governance.policyHash,
    decision,
  );
  if (decision !== 'allow') {
    const errorCode =
      decision === 'timeout' ? 'approval_timeout' : decision === 'deny' ? 'approval_denied' : 'cancelled';
    const error =
      decision === 'timeout' ? '审批超时' : decision === 'deny' ? '审批被拒绝' : '已取消';
    return denied(errorCode, error);
  }
  if (!outcomeAudited) {
    return denied('audit_unavailable', '审计账本不可用（AUDIT_UNAVAILABLE）');
  }

  const bindingError = checkSubagentBinding(governance.binding, input.settings.get(), input.cwd);
  if (bindingError) {
    recordSubagentBindingDrift(
      input.audit,
      input.run,
      governance.binding,
      governance.policyHash,
      bindingError,
    );
    return denied('binding_drift', bindingError);
  }
  return { ok: true };
}
