import type { AppSettings } from '@wbfm/shared/types';
import type { OperationBinding } from '@wbfm/shared/schemas';
import { DEFAULT_AGENT_POLICY } from '@wbfm/shared/schemas';
import {
  agentPolicyHash,
  assertBindingMatches,
  computeOperationBinding,
  evaluateCommandPolicy,
  isPathInside,
  isSensitivePath,
} from '../governance';

/** v2.13 M2：外部代理运行前的策略 / 命令 / 审批绑定计算（外迁以守住 300 行门禁） */

export type SubagentGovernance =
  | {
      ok: true;
      command: string;
      binding: OperationBinding;
      policyHash: string;
    }
  | { ok: false; errorCode: string; error: string };

export function buildSubagentGovernance(
  settings: AppSettings,
  cwd: string,
  env: NodeJS.ProcessEnv = process.env,
): SubagentGovernance {
  const policy = settings.agentPolicy ?? DEFAULT_AGENT_POLICY;
  if (isSensitivePath(cwd)) {
    return { ok: false, errorCode: 'policy_denied', error: '工作目录命中敏感路径' };
  }
  const deniedRoot = policy.paths.deniedRoots.find((root) => isPathInside(root, cwd));
  if (deniedRoot) {
    return { ok: false, errorCode: 'policy_denied', error: `工作目录被策略拒绝：${deniedRoot}` };
  }
  if (
    policy.paths.allowedRoots.length > 0 &&
    !policy.paths.allowedRoots.some((root) => isPathInside(root, cwd))
  ) {
    return { ok: false, errorCode: 'policy_denied', error: '工作目录不在允许范围内' };
  }
  const command = (settings.subagentCliCommand ?? '').trim();
  const commandPolicy = evaluateCommandPolicy(policy, command);
  if (!commandPolicy.allowed) {
    return {
      ok: false,
      errorCode: 'policy_denied',
      error: `命令被策略拒绝：${commandPolicy.matchedRule ?? 'exec-not-allowed'}`,
    };
  }
  const binding = computeOperationBinding({
    tool: 'subagent',
    args: { command, args: settings.subagentCliArgs ?? [] },
    cwd,
    env: env as Record<string, string>,
    policyHash: agentPolicyHash(policy),
  });
  return { ok: true, command, binding, policyHash: agentPolicyHash(policy) };
}

/** 审批通过后重算并比对；返回错误文案，null=未漂移 */
export function checkSubagentBinding(
  expected: OperationBinding,
  settings: AppSettings,
  cwd: string,
  env: NodeJS.ProcessEnv = process.env,
): string | null {
  try {
    const actual = computeOperationBinding({
      tool: 'subagent',
      args: {
        command: (settings.subagentCliCommand ?? '').trim(),
        args: settings.subagentCliArgs ?? [],
      },
      cwd,
      env: env as Record<string, string>,
      policyHash: agentPolicyHash(settings.agentPolicy ?? DEFAULT_AGENT_POLICY),
    });
    assertBindingMatches(expected, actual);
    return null;
  } catch (error) {
    return error instanceof Error ? error.message : '审批绑定已变化';
  }
}
