import type { TaskRunView } from '@wbfm/shared/schemas';
import { DEFAULT_AGENT_POLICY } from '@wbfm/shared/schemas';
import type { TaskRunRepository } from '@wbfm/database';
import type { TaskLoopEvent } from './control';
import type { ServiceDeps } from '../services/deps';
import type { ToolRuntime } from '../tools/tool-runtime';
import { createRuntimeLimits, type RuntimeLimits } from './runtime-limits';

/** v2.13 M4：任务循环的运行时限额 / 工具目录装配（外迁守行数门禁） */

type StoppedFinalize = (
  status: 'stopped',
  reason: 'policy_limit',
) => { run: TaskRunView; event: TaskLoopEvent };

export function createRunRuntimeLimits(
  deps: Pick<ServiceDeps, 'agentPolicy'>,
  run: TaskRunView,
): RuntimeLimits {
  return createRuntimeLimits({
    policy: deps.agentPolicy?.() ?? DEFAULT_AGENT_POLICY,
    startedAtMs: Date.parse(run.createdAt),
  });
}

export function buildToolCatalog(
  runtime: Pick<ToolRuntime, 'resolveTool'>,
  allowedTools: string[],
): string[] {
  return allowedTools
    .map((name) => {
      const resolved = runtime.resolveTool(name);
      return resolved ? `${name}：${resolved.tool.description}` : null;
    })
    .filter((entry): entry is string => Boolean(entry));
}

export function createToolGovernanceContext(
  deps: Pick<ServiceDeps, 'agentPolicy' | 'audit'>,
  runId: string,
) {
  return {
    runId,
    ...(deps.agentPolicy ? { policyDomains: deps.agentPolicy().domains } : {}),
    ...(deps.audit
      ? {
          governanceAudit: (input: { kind: 'policy_denied'; tool: string; reasonCode: string; outcome?: string }) => {
            deps.audit!.safeAppend({ actor: 'agent', ...input });
          },
        }
      : {}),
  };
}

export function createTaskLoopRuntime(input: {
  deps: Pick<ServiceDeps, 'agentPolicy'>;
  runtime: Pick<ToolRuntime, 'resolveTool'>;
  allowedTools: string[];
  run: TaskRunView;
  subtaskBrief?: string;
  subtaskAcceptance?: string[];
}) {
  return {
    toolCatalog: buildToolCatalog(input.runtime, input.allowedTools),
    subtaskContext: input.subtaskBrief
      ? { brief: input.subtaskBrief, acceptance: input.subtaskAcceptance ?? [] }
      : undefined,
    runtimeLimits: createRunRuntimeLimits(input.deps, input.run),
  };
}

/** 限额终止：写失败步骤（可选）→ 终态 stopped/policy_limit */
export async function* stopForPolicyLimit(input: {
  repo: Pick<TaskRunRepository, 'finishStep'>;
  finalize: StoppedFinalize;
  actionStepId?: string;
  error?: string;
}): AsyncGenerator<TaskLoopEvent, TaskRunView> {
  if (input.actionStepId) {
    input.repo.finishStep(input.actionStepId, {
      status: 'failed',
      error: input.error ?? '策略限额',
    });
  }
  const fin = input.finalize('stopped', 'policy_limit');
  yield fin.event;
  return fin.run;
}
