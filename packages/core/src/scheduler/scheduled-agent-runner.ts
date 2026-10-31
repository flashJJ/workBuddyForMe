import type { TaskRunRepository } from '@wbfm/database';
import { TASK_MAX_STEPS } from '@wbfm/shared/constants';
import {
  DEFAULT_AGENT_POLICY,
  isScheduledAgentTask,
  type AgentPolicy,
  type ScheduledTaskView,
  type TaskRunView,
} from '@wbfm/shared/schemas';
import type { TaskPlanner } from '../agent/types';
import { agentPolicyHash } from '../governance/policy';
import type { AuditService } from '../governance/audit';
import { auditCritical } from '../governance/audit';
import { resolveWorkspacePath } from '../governance/workspace';

/**
 * v2.13 M4：定时 Agent 触发。
 * - 校验无人值守模式 / 同任务未结束运行 / 并发上限；
 * - 创建 task_run（origin_scheduled_task_id）后由后台任务运行服务启动；
 * - 成功 / 失败 / 跳过均写审计；终态事件由 task-runner-service 写 scheduled_run_finished。
 */

export interface TaskLaunchArtifacts {
  planner: TaskPlanner;
  allowedTools: string[];
  visionCapable: boolean;
}

export interface TaskStarterLike {
  start(params: {
    run: TaskRunView;
    planner: TaskPlanner;
    allowedTools: string[];
    visionCapable: boolean;
  }): unknown;
}

export interface ScheduledAgentRunnerDeps {
  repo: Pick<TaskRunRepository, 'listNonTerminalRuns' | 'createRun' | 'updateRunStatus'>;
  starter: TaskStarterLike;
  launch: (run: TaskRunView) => TaskLaunchArtifacts;
  policy?: AgentPolicy;
  audit?: AuditService;
  now?: () => number;
}

export type ScheduledSkipReason =
  | 'INVALID_PAYLOAD'
  | 'UNATTENDED_MODE_NOT_ALLOWED'
  | 'SKIPPED_ACTIVE_RUN'
  | 'MAX_CONCURRENT_RUNS'
  | 'WORKSPACE_INVALID';

export type ScheduledAgentStartResult =
  | { status: 'started'; runId: string }
  | { status: 'skipped'; reason: ScheduledSkipReason }
  | { status: 'failed'; runId: string; error: string };

export interface StartScheduledAgentInput {
  task: ScheduledTaskView;
  /** 本次预定触发时刻（markFired 之前） */
  scheduledAt: string;
}

export function createScheduledAgentRunner(deps: ScheduledAgentRunnerDeps) {
  const policy = deps.policy ?? DEFAULT_AGENT_POLICY;
  const policyHash = agentPolicyHash(policy);

  const blocked = (
    task: ScheduledTaskView,
    reason: ScheduledSkipReason,
    message: string,
    runId?: string,
  ): void => {
    const payload = task.payload;
    auditCritical(deps.audit, {
      kind: 'unattended_blocked',
      actor: 'agent',
      runId: runId ?? null,
      conversationId:
        payload?.kind === 'agent_task' ? payload.conversationId : null,
      policyHash,
      reasonCode: reason,
      decision: 'deny',
      outcome: message,
    });
  };

  return {
    start(input: StartScheduledAgentInput): ScheduledAgentStartResult {
      const { task } = input;
      if (!isScheduledAgentTask(task.payload)) {
        blocked(task, 'INVALID_PAYLOAD', '定时任务不是 agent_task');
        return { status: 'skipped', reason: 'INVALID_PAYLOAD' };
      }
      const payload = task.payload;
      if (
        payload.permissionMode === 'full_access' ||
        !policy.unattended.allowedModes.includes(payload.permissionMode)
      ) {
        blocked(task, 'UNATTENDED_MODE_NOT_ALLOWED', `模式不在无人值守白名单：${payload.permissionMode}`);
        return { status: 'skipped', reason: 'UNATTENDED_MODE_NOT_ALLOWED' };
      }

      const active = deps.repo.listNonTerminalRuns();
      if (active.some((run) => run.originScheduledTaskId === task.id)) {
        blocked(task, 'SKIPPED_ACTIVE_RUN', '同一任务已有未结束的 Agent 运行');
        return { status: 'skipped', reason: 'SKIPPED_ACTIVE_RUN' };
      }
      const concurrent = active.filter((run) => run.originScheduledTaskId !== null).length;
      if (concurrent >= policy.unattended.maxConcurrentRuns) {
        blocked(
          task,
          'MAX_CONCURRENT_RUNS',
          `无人值守运行已达上限 ${policy.unattended.maxConcurrentRuns}`,
        );
        return { status: 'skipped', reason: 'MAX_CONCURRENT_RUNS' };
      }

      let workspacePath: string | null = null;
      try {
        if (payload.workspacePath) workspacePath = resolveWorkspacePath(payload.workspacePath);
      } catch (error) {
        const message = error instanceof Error ? error.message : '工作目录不可用';
        blocked(task, 'WORKSPACE_INVALID', message);
        return { status: 'skipped', reason: 'WORKSPACE_INVALID' };
      }

      const maxSteps = Math.min(
        payload.maxSteps ?? TASK_MAX_STEPS,
        TASK_MAX_STEPS,
        policy.limits.maxSteps,
      );
      const run = deps.repo.createRun({
        conversationId: payload.conversationId,
        assistantId: payload.assistantId ?? task.assistantId,
        goal: payload.goal,
        maxSteps,
        permissionMode: payload.permissionMode,
        workspacePath,
        policySnapshotJson: JSON.stringify(policy),
        originScheduledTaskId: task.id,
      });

      try {
        const artifacts = deps.launch(run);
        deps.starter.start({ run, ...artifacts });
        auditCritical(deps.audit, {
          kind: 'scheduled_run_started',
          actor: 'agent',
          runId: run.id,
          conversationId: run.conversationId || null,
          policyHash: run.policyHash,
          decision: 'allow',
          outcome: `mode:${run.permissionMode}@${input.scheduledAt}`,
        });
        return { status: 'started', runId: run.id };
      } catch (error) {
        const message = error instanceof Error ? error.message : '定时运行启动失败';
        deps.repo.updateRunStatus(run.id, 'failed', 'error');
        auditCritical(deps.audit, {
          kind: 'scheduled_run_finished',
          actor: 'agent',
          runId: run.id,
          conversationId: run.conversationId || null,
          policyHash: run.policyHash,
          decision: 'deny',
          reasonCode: 'START_FAILED',
          outcome: message,
        });
        return { status: 'failed', runId: run.id, error: message };
      }
    },
  };
}

export type ScheduledAgentRunner = ReturnType<typeof createScheduledAgentRunner>;
