import { createHash } from 'node:crypto';
import type {
  AgentPermissionMode,
  AgentPolicy,
  AgentPolicyDecision,
} from '@wbfm/shared/schemas';
import { canonicalJson, matchesDomainRule } from '@wbfm/shared/schemas';
import { isPathInside, isSensitivePath } from './workspace';

export { matchesDomainRule };

/** v2.13 M2：策略求值（deny wins；纯函数，不做 IO） */

const DESKTOP_CONTROL_TOOLS = [
  'mouse_move',
  'mouse_click',
  'mouse_scroll',
  'keyboard_type',
  'keyboard_press',
  'window_focus',
  'app_launch',
] as const;

export function isDesktopControlTool(toolName: string): boolean {
  return (DESKTOP_CONTROL_TOOLS as readonly string[]).includes(toolName);
}

export function matchesToolRule(rule: string, toolName: string): boolean {
  const trimmed = rule.trim();
  if (!trimmed) return false;
  if (trimmed === '*' || trimmed === 'all') return true;
  if (trimmed.endsWith('*')) return toolName.startsWith(trimmed.slice(0, -1));
  return toolName === trimmed;
}

function findMatch(rules: string[], value: string, matcher: (rule: string, value: string) => boolean): string | null {
  for (const rule of rules) if (matcher(rule, value)) return rule;
  return null;
}

function deny(reasonCode: AgentPolicyDecision['reasonCode'], layer: AgentPolicyDecision['layer'], matchedRule?: string): AgentPolicyDecision {
  return { decision: 'deny', reasonCode, layer, ...(matchedRule ? { matchedRule } : {}) };
}

function allow(reasonCode: AgentPolicyDecision['reasonCode'], layer: AgentPolicyDecision['layer'], matchedRule?: string): AgentPolicyDecision {
  return { decision: 'allow', reasonCode, layer, ...(matchedRule ? { matchedRule } : {}) };
}

function ask(reasonCode: AgentPolicyDecision['reasonCode'], layer: AgentPolicyDecision['layer'], matchedRule?: string): AgentPolicyDecision {
  return { decision: 'ask', reasonCode, layer, ...(matchedRule ? { matchedRule } : {}) };
}

function checkPaths(input: {
  policy: AgentPolicy;
  workspacePath?: string | null;
  pathTargets?: string[];
}): AgentPolicyDecision | null {
  const targets = input.pathTargets ?? [];
  for (const target of targets) {
    if (isSensitivePath(target)) return deny('POLICY_DENY', 'policy', 'sensitive-path');
    const denied = findMatch(input.policy.paths.deniedRoots, target, (rule, value) =>
      isPathInside(rule, value),
    );
    if (denied) return deny('POLICY_DENY', 'policy', `path:${denied}`);
    if (input.policy.paths.allowedRoots.length > 0) {
      const allowed = findMatch(input.policy.paths.allowedRoots, target, (rule, value) =>
        isPathInside(rule, value),
      );
      if (!allowed) return deny('POLICY_DENY', 'policy', 'path-not-allowed');
    }
  }
  if (targets.length === 0) return null;
  const workspace = input.workspacePath?.trim();
  if (!workspace) return ask('WORKSPACE_REQUIRED', 'mode');
  for (const target of targets) {
    if (!isPathInside(workspace, target)) return deny('WORKSPACE_ESCAPE', 'mode');
  }
  return null;
}

/**
 * 求值顺序：策略 deny → 模式处置 → 策略 allow（仅 write）→ 默认询问。
 * 持久授权（remember）在门控层相加，不在本函数内。
 */
export function evaluateAgentPolicy(input: {
  policy: AgentPolicy;
  toolName: string;
  permission: 'read' | 'write' | 'danger';
  mode: AgentPermissionMode;
  workspacePath?: string | null;
  pathTargets?: string[];
  domain?: string;
}): AgentPolicyDecision {
  const { policy, toolName, permission, mode } = input;

  const deniedTool = findMatch(policy.tools.deny, toolName, matchesToolRule);
  if (deniedTool) return deny('POLICY_DENY', 'policy', `tool:${deniedTool}`);

  if (input.domain) {
    const deniedDomain = findMatch(policy.domains.deny, input.domain, matchesDomainRule);
    if (deniedDomain) return deny('POLICY_DENY', 'policy', `domain:${deniedDomain}`);
    if (policy.domains.allow.length > 0) {
      const allowedDomain = findMatch(policy.domains.allow, input.domain, matchesDomainRule);
      if (!allowedDomain) return deny('POLICY_DENY', 'policy', 'domain-not-allowed');
    }
  }

  if (permission !== 'read' && mode === 'plan_only') return deny('MODE_DENY', 'mode');

  const pathDecision = checkPaths(input);
  if (pathDecision) return pathDecision;

  if (permission === 'read') return allow('MODE_ALLOW', 'mode');

  if (mode === 'full_access') return allow('MODE_ALLOW', 'mode');
  if (mode === 'confirm_each') {
    if (permission === 'write' && policy.tools.allow.length > 0) {
      const allowedTool = findMatch(policy.tools.allow, toolName, matchesToolRule);
      if (allowedTool) return allow('POLICY_ALLOW', 'policy', `tool:${allowedTool}`);
    }
    return ask('MODE_ASK', 'mode');
  }

  // auto_edits / smart_approve
  if (permission === 'write') {
    if (input.workspacePath && (input.pathTargets?.length ?? 0) > 0) {
      return allow('MODE_ALLOW', 'mode');
    }
    if (input.workspacePath && policy.tools.allow.length > 0) {
      const allowedTool = findMatch(policy.tools.allow, toolName, matchesToolRule);
      if (allowedTool) return allow('POLICY_ALLOW', 'policy', `tool:${allowedTool}`);
    }
    return ask('MODE_ASK', 'mode');
  }

  // danger
  if (!isDesktopControlTool(toolName) && policy.tools.dangerAllow.length > 0) {
    const allowedDanger = findMatch(policy.tools.dangerAllow, toolName, matchesToolRule);
    if (allowedDanger) return allow('POLICY_ALLOW', 'policy', `tool:${allowedDanger}`);
  }
  return ask('MODE_ASK', 'mode');
}

/** 命令策略：deny 优先；allow 非空时仅允许命中项 */
export function evaluateCommandPolicy(
  policy: AgentPolicy,
  command: string,
): { allowed: boolean; matchedRule?: string } {
  const denied = findMatch(policy.exec.denyCommands, command, matchesToolRule);
  if (denied) return { allowed: false, matchedRule: `exec-deny:${denied}` };
  if (policy.exec.allowCommands.length > 0) {
    const allowed = findMatch(policy.exec.allowCommands, command, matchesToolRule);
    if (!allowed) return { allowed: false, matchedRule: 'exec-not-allowed' };
    return { allowed: true, matchedRule: `exec-allow:${allowed}` };
  }
  return { allowed: true };
}

export function agentPolicyHash(policy: AgentPolicy): string {
  return createHash('sha256').update(canonicalJson(policy)).digest('hex');
}

/** 从参数中提取显式路径（只认常见键，避免误判任意字段） */
export function extractPathTargets(args: unknown): string[] {
  if (typeof args !== 'object' || args === null) return [];
  const record = args as Record<string, unknown>;
  const out: string[] = [];
  for (const key of ['path', 'filePath', 'dir', 'cwd', 'workspacePath']) {
    const value = record[key];
    if (typeof value === 'string' && value.trim()) out.push(value.trim());
  }
  const paths = record.paths;
  if (Array.isArray(paths)) {
    for (const value of paths) if (typeof value === 'string' && value.trim()) out.push(value.trim());
  }
  return out;
}

/** 从参数中提取 http(s) 域名（用于出站工具策略） */
export function extractDomain(args: unknown): string | undefined {
  if (typeof args !== 'object' || args === null) return undefined;
  const url = (args as Record<string, unknown>).url;
  if (typeof url !== 'string') return undefined;
  try {
    const parsed = new URL(url);
    return parsed.hostname || undefined;
  } catch {
    return undefined;
  }
}
