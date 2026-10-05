import {
  FLOW_DESKTOP_CONTROL_TOOLS,
  type FlowUnattendedPolicy,
  type PermissionLevel,
} from '@wbfm/shared';

/** 桌面控制永久禁单（只读的字符串数组视图，避免把字面量联合类型带入 includes） */
const DESKTOP_BAN_LIST: readonly string[] = FLOW_DESKTOP_CONTROL_TOOLS;

/**
 * v0.9 无人值守（API/MCP）工具授权门控（纯函数，零外部依赖）：
 * - read 工具直接放行；
 * - 桌面控制类（鼠标/键盘/窗口/UIA）在任何策略下都不可由无人值守链路调用；
 * - write/danger 仅当策略为 allowlist 且工具名在白名单内放行；
 * - 其余拒绝（默认安全：deny_all）。
 * SSRF/超时/熔断等既有工具安全机制对放行的调用同样生效。
 */
export type PolicyDecisionReason =
  | 'read_allowed'
  | 'desktop_control_banned'
  | 'policy_allow'
  | 'policy_deny';

export interface PolicyDecision {
  allowed: boolean;
  reason: PolicyDecisionReason;
}

export function evaluateUnattendedPolicy(
  policy: FlowUnattendedPolicy,
  toolName: string,
  permission: PermissionLevel,
): PolicyDecision {
  if (permission === 'read') return { allowed: true, reason: 'read_allowed' };
  // 桌面 GUI 操控：无人值守永久禁单（最高优先级，先于白名单）
  if (DESKTOP_BAN_LIST.includes(toolName)) {
    return { allowed: false, reason: 'desktop_control_banned' };
  }
  if (policy.mode === 'allowlist' && policy.allowed.includes(toolName)) {
    return { allowed: true, reason: 'policy_allow' };
  }
  return { allowed: false, reason: 'policy_deny' };
}

/**
 * 拒绝原因 code → 节点输出文本（审计可在 run 节点记录中检索 [policy_deny:*] 标记）。
 * 引擎在无人值守拒绝时把该文本作为 tool 节点 ok:false 输出落库。
 */
export function policyDenyText(reason: PolicyDecisionReason, toolName: string): string {
  if (reason === 'desktop_control_banned') {
    return `无人值守策略拒绝：工具 ${toolName} 属于桌面控制类（鼠标/键盘/窗口），API/MCP 调用永久禁止，请改用画布人工试运行。[policy_deny:desktop_control_banned]`;
  }
  return `无人值守策略拒绝：工具 ${toolName} 不在端点白名单中（默认拒绝写入/高危操作），请在端点设置中加入允许列表。[policy_deny:not_allowlisted]`;
}
