import type { ChatMessage } from '@wbfm/ai';
import type { PermissionLevel, ToolTraceEntry } from '@wbfm/shared/types';
import {
  DEFAULT_AGENT_POLICY,
  type AgentPermissionMode,
  type AgentPolicy,
  type OperationBinding,
} from '@wbfm/shared/schemas';
import type { ServiceDeps } from '../services/deps';
import type { Tool } from '../tools/types';
import {
  agentPolicyHash,
  assertBindingMatches,
  computeOperationBinding,
  evaluateAgentPolicy,
  extractDomain,
  extractPathTargets,
  summarizeBinding,
} from '../governance';
import type { OrchestratorEvent } from './types';

export interface ApprovalContext {
  runId?: string | null;
  conversationId?: string | null;
  deepLink: string;
}

export interface ToolGateParams {
  deps: ServiceDeps;
  tool: Tool | undefined;
  toolName: string;
  callId: string;
  argsSummary: string;
  assistantId: string;
  signal?: AbortSignal;
  /** v0.6 M4：工具来源标识 */
  source: string;
  /** v0.6 M4：权限级别（调用方已解析，避免重复查 tool?.permission） */
  permission: PermissionLevel;
  /** v0.7 M2：任务作用域（对话 id / 任务运行 id），用于 remember='task' 批量授权 */
  taskScope?: string;
  /** v2.7：审批中心深链与运行归属 */
  approvalContext?: ApprovalContext;
  /** v2.13：原始参数（审批绑定需要；缺省时按空对象） */
  args?: unknown;
  /** v2.13：本次运行模式（缺省取策略 defaultMode） */
  mode?: AgentPermissionMode;
  /** v2.13：工作目录（realpath 归一化后） */
  workspacePath?: string | null;
  /** v2.13：调用方已解析的策略（缺省读 deps.agentPolicy） */
  policy?: AgentPolicy;
}

export interface ToolGateResult {
  denied: boolean;
  /** denied=true 时已生成的拒绝 trace 条目（调用方负责 push） */
  traceEntry?: ToolTraceEntry;
  /** denied=true 时回灌给模型的「用户拒绝」tool 消息（调用方负责 push 到出站消息） */
  toolMessage?: ChatMessage;
}

function explicitDeny(deps: ServiceDeps, toolName: string, assistantId: string): boolean {
  if (!deps.permissions) return false;
  const global = deps.permissions.getPermission(toolName, 'all');
  if (global?.action === 'deny') return true;
  const scoped = deps.permissions.getPermission(toolName, `assistant:${assistantId}`);
  return scoped?.action === 'deny';
}

function deniedResult(
  params: ToolGateParams,
  message: string,
): ToolGateResult {
  const { toolName, callId, source, permission } = params;
  const traceEntry: ToolTraceEntry = {
    callId,
    tool: toolName,
    argsSummary: params.argsSummary,
    status: 'error',
    durationMs: 0,
    resultSummary: message,
    error: message,
    startedAt: new Date().toISOString(),
    source,
    permission,
  };
  return {
    denied: true,
    traceEntry,
    toolMessage: { role: 'tool', content: message, toolCallId: callId, name: toolName },
  };
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
  const { deps, tool, toolName, callId, assistantId, signal, source, permission, taskScope, approvalContext } = params;
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

  if (explicitDeny(deps, toolName, assistantId)) {
    return deniedResult(params, `工具 ${toolName} 已被权限记录拒绝`);
  }

  if (decision.decision === 'deny') {
    const reason = decision.matchedRule
      ? `${decision.reasonCode}（${decision.matchedRule}）`
      : decision.reasonCode;
    const result = deniedResult(params, `工具 ${toolName} 被策略拒绝：${reason}`);
    yield {
      event: 'tool',
      data: {
        phase: 'end',
        callId,
        tool: toolName,
        status: 'error',
        durationMs: 0,
        resultSummary: result.traceEntry!.resultSummary,
        error: result.traceEntry!.error,
        source,
        permission,
      },
    };
    return result;
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
    policyHash: agentPolicyHash(policy),
  });
  const bindingSummary = summarizeBinding(binding, params.argsSummary);

  const decisionPromise = deps.confirmations ? deps.confirmations.request(callId, signal) : null;
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
    try {
      const actual = computeOperationBinding({
        tool: toolName,
        args,
        cwd: params.workspacePath ?? null,
        policyHash: agentPolicyHash(policy),
      });
      assertBindingMatches(binding, actual);
      return { denied: false };
    } catch (error) {
      const message = error instanceof Error ? error.message : '审批绑定已变化';
      const result = deniedResult(params, message);
      yield {
        event: 'tool',
        data: {
          phase: 'end',
          callId,
          tool: toolName,
          status: 'error',
          durationMs: 0,
          resultSummary: message,
          error: message,
          source,
          permission,
        },
      };
      return result;
    }
  }

  const message = `工具 ${toolName} 未获得用户授权（权限级别：${permission}），用户已拒绝本次调用。请向用户说明情况。`;
  const result = deniedResult(params, message);
  yield {
    event: 'tool',
    data: {
      phase: 'end',
      callId,
      tool: toolName,
      status: 'error',
      durationMs: 0,
      resultSummary: message,
      error: message,
      source,
      permission,
    },
  };
  return result;
}
