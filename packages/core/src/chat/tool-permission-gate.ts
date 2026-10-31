import { DEFAULT_AGENT_POLICY, type OperationBinding } from '@wbfm/shared/schemas';
import type { ServiceDeps } from '../services/deps';
import type { ConfirmationSettlement } from '../services/pending-confirmations';
import {
  agentPolicyHash,
  assertBindingMatches,
  auditCritical,
  computeOperationBinding,
  evaluateAgentPolicy,
  extractDomain,
  extractPathTargets,
  summarizeBinding,
} from '../governance';
import type { OrchestratorEvent } from './types';
import type { ToolGateParams, ToolGateResult } from './tool-gate-types';
import { deniedWithEvent } from './tool-gate-denial';

export type { ApprovalContext, ToolGateParams, ToolGateResult } from './tool-gate-types';

function explicitDeny(deps: ServiceDeps, toolName: string, assistantId: string): boolean {
  if (!deps.permissions) return false;
  const global = deps.permissions.getPermission(toolName, 'all');
  if (global?.action === 'deny') return true;
  const scoped = deps.permissions.getPermission(toolName, `assistant:${assistantId}`);
  return scoped?.action === 'deny';
}

/**
 * v0.6 M2 权限门控 + v2.13 策略 / 审批绑定：
 * 策略 deny → 显式授权 deny → 模式 allow → 持久授权 → HITL。
 * 关键时序：先调 confirmations.request() 注册挂起项，再 yield
 * tool_confirmation_required 事件（Promise executor 同步注册）。
 */
export async function* gateToolPermission(
  params: ToolGateParams,
): AsyncGenerator<OrchestratorEvent, ToolGateResult> {
  const { deps, tool, toolName, callId, assistantId, signal, permission, taskScope, approvalContext } = params;
  const policy = params.policy ?? deps.agentPolicy?.() ?? DEFAULT_AGENT_POLICY;
  const mode = params.mode ?? policy.defaultMode;
  const args = params.args ?? {};

  const decision = evaluateAgentPolicy({
    policy,
    toolName,
    permission,
    mode,
    workspacePath: params.workspacePath ?? null,
    pathTargets: extractPathTargets(args),
    domain: extractDomain(args),
  });

  const policyHash = agentPolicyHash(policy);
  const auditBase = {
    actor: 'agent' as const,
    tool: toolName,
    runId: approvalContext?.runId ?? null,
    conversationId: approvalContext?.conversationId ?? null,
    policyHash,
  };

  if (explicitDeny(deps, toolName, assistantId)) {
    auditCritical(deps.audit, {
      ...auditBase,
      kind: 'policy_denied',
      decision: 'deny',
      reasonCode: 'EXPLICIT_DENY',
    });
    return yield* deniedWithEvent(params, `工具 ${toolName} 已被权限记录拒绝`);
  }

  if (decision.decision === 'deny') {
    const reason = decision.matchedRule
      ? `${decision.reasonCode}（${decision.matchedRule}）`
      : decision.reasonCode;
    auditCritical(deps.audit, {
      ...auditBase,
      kind: 'policy_denied',
      decision: 'deny',
      reasonCode: decision.reasonCode,
      outcome: decision.matchedRule ?? null,
    });
    return yield* deniedWithEvent(params, `工具 ${toolName} 被策略拒绝：${reason}`);
  }

  const grantedByRecord =
    decision.decision === 'allow' ||
    !tool ||
    !deps.permissions ||
    deps.permissions.isAllowed(toolName, permission, `assistant:${assistantId}`) ||
    Boolean(taskScope && deps.taskGrants?.isGranted(toolName, taskScope));
  if (grantedByRecord) return { denied: false };

  const binding: OperationBinding = computeOperationBinding({
    tool: toolName,
    args,
    cwd: params.workspacePath ?? null,
    policyHash,
  });
  const bindingSummary = summarizeBinding(binding, params.argsSummary);

  if (
    !auditCritical(deps.audit, {
      ...auditBase,
      kind: 'approval_requested',
      decision: 'ask',
      reasonCode: decision.reasonCode,
      binding,
      outcome: decision.matchedRule ?? null,
    })
  ) {
    return yield* deniedWithEvent(
      params,
      `审计账本不可用（AUDIT_UNAVAILABLE），工具 ${toolName} 已按安全策略拒绝。`,
    );
  }

  let auditFailed = false;
  const recordSettlement = (settlement: ConfirmationSettlement): void => {
    const kind =
      settlement === 'allow'
        ? 'approval_granted'
        : settlement === 'timeout'
          ? 'approval_timeout'
          : 'approval_denied';
    const reasonCode =
      settlement === 'timeout'
        ? 'APPROVAL_TIMEOUT'
        : settlement === 'abort'
          ? 'APPROVAL_ABORTED'
          : null;
    if (
      !auditCritical(deps.audit, {
        ...auditBase,
        kind,
        decision: settlement === 'allow' ? 'allow' : 'deny',
        reasonCode,
        binding,
        outcome: settlement,
      })
    ) {
      auditFailed = true;
    }
  };

  const decisionPromise = deps.confirmations
    ? deps.confirmations.request(callId, signal, recordSettlement)
    : null;
  const approval =
    deps.confirmations && deps.approvals
      ? deps.approvals.register(
          {
            id: `tool:${callId}`,
            source: 'tool',
            title: `工具授权：${toolName}`,
            tool: toolName,
            permission,
            argsSummary: params.argsSummary,
            bindingSummary,
            policyReason: decision.reasonCode,
            runId: approvalContext?.runId ?? null,
            conversationId: approvalContext?.conversationId ?? null,
            deepLink: approvalContext?.deepLink ?? '/approvals',
          },
          (decisionInput) => {
            deps.confirmations?.resolve(callId, decisionInput.action);
          },
        )
      : null;
  if (decisionPromise && approval) {
    void decisionPromise.finally(() => approval.remove());
  }
  yield {
    event: 'tool_confirmation_required',
    data: { callId, tool: toolName, permission, argsSummary: params.argsSummary },
  };
  const resolved = decisionPromise ? await decisionPromise : 'deny';
  if (resolved === 'allow') {
    if (auditFailed) {
      return yield* deniedWithEvent(
        params,
        `审计账本不可用（AUDIT_UNAVAILABLE），工具 ${toolName} 已按安全策略拒绝。`,
      );
    }
    try {
      const actual = computeOperationBinding({
        tool: toolName,
        args,
        cwd: params.workspacePath ?? null,
        policyHash,
      });
      assertBindingMatches(binding, actual);
      return { denied: false };
    } catch (error) {
      const message = error instanceof Error ? error.message : '审批绑定已变化';
      auditCritical(deps.audit, {
        ...auditBase,
        kind: 'binding_drift',
        decision: 'deny',
        reasonCode: 'APPROVAL_BINDING_DRIFT',
        binding,
        outcome: message,
      });
      return yield* deniedWithEvent(params, message);
    }
  }

  if (!decisionPromise) {
    auditCritical(deps.audit, {
      ...auditBase,
      kind: 'approval_denied',
      decision: 'deny',
      reasonCode: 'NO_APPROVAL_UI',
      binding,
      outcome: 'deny',
    });
  }
  return yield* deniedWithEvent(
    params,
    `工具 ${toolName} 未获得用户授权（权限级别：${permission}），用户已拒绝本次调用。请向用户说明情况。`,
  );
}
