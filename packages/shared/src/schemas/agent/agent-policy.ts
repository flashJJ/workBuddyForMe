import { z } from 'zod';
import {
  agentPermissionModeSchema,
  AGENT_UNATTENDED_MODES,
  type AgentPermissionMode,
} from './agent-permission';

/** v2.13 M2：Agent 治理策略（settings JSON，deny wins） */

export const AGENT_POLICY_VERSION = 1;
export const AGENT_POLICY_RULE_MAX = 50;
export const AGENT_POLICY_RULE_LENGTH = 256;

const ruleList = z
  .array(z.string().trim().min(1).max(AGENT_POLICY_RULE_LENGTH))
  .max(AGENT_POLICY_RULE_MAX);

const unattendedSchema = z.object({
  allowedModes: z.array(z.enum(AGENT_UNATTENDED_MODES)).max(4),
  maxConcurrentRuns: z.number().int().min(1).max(3),
});

const toolsSchema = z.object({
  deny: ruleList,
  allow: ruleList,
  dangerAllow: ruleList,
});

const pathsSchema = z.object({
  allowedRoots: ruleList,
  deniedRoots: ruleList,
  sensitiveNames: ruleList,
});

const domainsSchema = z.object({
  allow: ruleList,
  deny: ruleList,
});

const execSchema = z.object({
  allowCommands: ruleList,
  denyCommands: ruleList,
});

const limitsSchema = z.object({
  maxSteps: z.number().int().min(1).max(50),
  maxRuntimeMs: z.number().int().min(60_000).max(3_600_000),
  maxWritesPerRun: z.number().int().min(1).max(1000),
  maxExternalCallsPerRun: z.number().int().min(1).max(200),
});

export const agentPolicySchema = z.object({
  version: z.literal(AGENT_POLICY_VERSION),
  defaultMode: agentPermissionModeSchema,
  unattended: unattendedSchema,
  tools: toolsSchema,
  paths: pathsSchema,
  domains: domainsSchema,
  exec: execSchema,
  limits: limitsSchema,
});

export type AgentPolicy = z.infer<typeof agentPolicySchema>;

export const DEFAULT_AGENT_POLICY: AgentPolicy = {
  version: AGENT_POLICY_VERSION,
  defaultMode: 'confirm_each',
  unattended: {
    allowedModes: [...AGENT_UNATTENDED_MODES],
    maxConcurrentRuns: 1,
  },
  tools: { deny: [], allow: [], dangerAllow: [] },
  paths: { allowedRoots: [], deniedRoots: [], sensitiveNames: ['.ssh', '.gnupg', '.aws', '.config/gcloud'] },
  domains: { allow: [], deny: [] },
  exec: { allowCommands: [], denyCommands: [] },
  limits: {
    maxSteps: 20,
    maxRuntimeMs: 600_000,
    maxWritesPerRun: 100,
    maxExternalCallsPerRun: 20,
  },
};

/** 策略求值结论 */
export interface AgentPolicyDecision {
  decision: 'allow' | 'deny' | 'ask';
  reasonCode:
    | 'POLICY_DENY'
    | 'POLICY_ALLOW'
    | 'MODE_ALLOW'
    | 'MODE_ASK'
    | 'MODE_DENY'
    | 'WORKSPACE_REQUIRED'
    | 'WORKSPACE_ESCAPE'
    | 'DEFAULT_ASK';
  layer: 'policy' | 'mode' | 'default';
  matchedRule?: string;
}

export interface AgentPolicyEvaluationInput {
  policy: AgentPolicy;
  toolName: string;
  permission: 'read' | 'write' | 'danger';
  mode: AgentPermissionMode;
  workspacePath?: string | null;
  /** 工具参数中可识别的路径（已归一化） */
  pathTargets?: string[];
  /** 出站工具的目标域名 */
  domain?: string;
}

function mergeSection<T extends object>(base: T, value: unknown): T {
  return typeof value === 'object' && value !== null
    ? { ...base, ...(value as Partial<T>) }
    : base;
}

/** 策略读取钳制：缺字段用默认值补齐；非法形状回落整份默认 */
export function resolveAgentPolicy(value: unknown): AgentPolicy {
  const candidate =
    typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {};
  const merged: AgentPolicy = {
    version: AGENT_POLICY_VERSION,
    defaultMode:
      (candidate.defaultMode as AgentPermissionMode | undefined) ?? DEFAULT_AGENT_POLICY.defaultMode,
    unattended: mergeSection(DEFAULT_AGENT_POLICY.unattended, candidate.unattended),
    tools: mergeSection(DEFAULT_AGENT_POLICY.tools, candidate.tools),
    paths: mergeSection(DEFAULT_AGENT_POLICY.paths, candidate.paths),
    domains: mergeSection(DEFAULT_AGENT_POLICY.domains, candidate.domains),
    exec: mergeSection(DEFAULT_AGENT_POLICY.exec, candidate.exec),
    limits: mergeSection(DEFAULT_AGENT_POLICY.limits, candidate.limits),
  };
  const parsed = agentPolicySchema.safeParse(merged);
  return parsed.success ? parsed.data : DEFAULT_AGENT_POLICY;
}
