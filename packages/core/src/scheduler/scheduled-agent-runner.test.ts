import { describe, expect, it } from 'vitest';
import { createDatabase } from '@wbfm/database';
import { DEFAULT_AGENT_POLICY, type AgentPolicy, type ScheduledTaskView, type TaskRunView } from '@wbfm/shared/schemas';
import { createAuditService } from '../governance/audit';
import { createScheduledAgentRunner, type TaskLaunchArtifacts } from './scheduled-agent-runner';

function task(payload: ScheduledTaskView['payload'], id = 's1'): ScheduledTaskView {
  return {
    id,
    assistantId: 'a1',
    kind: 'once',
    hour: 9,
    minute: 0,
    weekday: null,
    atDate: '2026-11-01',
    timezone: 'Asia/Shanghai',
    text: '定时归档',
    enabled: true,
    nextRunAt: '2026-10-31T01:00:00.000Z',
    lastFiredAt: null,
    payload,
    createdAt: '2026-10-30T00:00:00.000Z',
    updatedAt: '2026-10-30T00:00:00.000Z',
  };
}

function agentPayload(overrides: Record<string, unknown> = {}) {
  return {
    kind: 'agent_task' as const,
    goal: '整理下载目录',
    conversationId: 'c1',
    permissionMode: 'confirm_each' as const,
    notify: 'work_signal' as const,
    ...overrides,
  };
}

function activeRun(overrides: Partial<TaskRunView>): TaskRunView {
  return {
    id: 'existing',
    conversationId: 'c1',
    assistantId: 'a1',
    goal: '旧运行',
    status: 'running',
    stepCount: 0,
    failureCount: 0,
    maxSteps: 10,
    stopReason: null,
    permissionMode: 'confirm_each',
    workspacePath: null,
    originScheduledTaskId: 's1',
    policyHash: null,
    createdAt: '2026-10-31T00:00:00.000Z',
    updatedAt: '2026-10-31T00:00:00.000Z',
    finishedAt: null,
    ...overrides,
  };
}

interface SetupOptions {
  policy?: Partial<AgentPolicy>;
  launch?: () => TaskLaunchArtifacts;
  onStart?: () => void;
  initialRuns?: TaskRunView[];
}

function setup(options: SetupOptions = {}) {
  const db = createDatabase(':memory:');
  const audit = createAuditService(db);
  const runs: TaskRunView[] = options.initialRuns ?? [];
  const started: unknown[] = [];
  const repo = {
    listNonTerminalRuns: () =>
      runs.filter((run) => run.status === 'queued' || run.status === 'running' || run.status === 'paused'),
    createRun: (fields: {
      conversationId: string | null;
      assistantId: string;
      goal: string;
      maxSteps: number;
      permissionMode?: TaskRunView['permissionMode'];
      workspacePath?: string | null;
      originScheduledTaskId?: string | null;
    }) => {
      const ts = '2026-10-31T01:00:00.000Z';
      const run = activeRun({
        id: `r${runs.length + 1}`,
        conversationId: fields.conversationId ?? '',
        assistantId: fields.assistantId,
        goal: fields.goal,
        status: 'queued',
        maxSteps: fields.maxSteps,
        permissionMode: fields.permissionMode ?? 'confirm_each',
        workspacePath: fields.workspacePath ?? null,
        originScheduledTaskId: fields.originScheduledTaskId ?? null,
        createdAt: ts,
        updatedAt: ts,
        finishedAt: null,
      });
      runs.push(run);
      return run;
    },
    updateRunStatus: (id: string, status: TaskRunView['status'], stopReason?: TaskRunView['stopReason']) => {
      const run = runs.find((item) => item.id === id);
      if (!run) return null;
      run.status = status;
      run.stopReason = stopReason ?? run.stopReason;
      return run;
    },
  };

  const runner = createScheduledAgentRunner({
    repo,
    starter: {
      start: (params) => {
        if (options.onStart) options.onStart();
        started.push(params);
      },
    },
    launch:
      options.launch ??
      (() => ({ planner: {} as never, allowedTools: [], visionCapable: true })),
    policy: { ...DEFAULT_AGENT_POLICY, ...options.policy },
    audit,
  });
  return { db, audit, runner, runs, started };
}

describe('定时 Agent 触发（v2.13 M4）', () => {
  it('创建 queued 运行并后台启动，写 scheduled_run_started', () => {
    const { db, audit, runner, runs, started } = setup();
    const result = runner.start({
      task: task(agentPayload()),
      scheduledAt: '2026-10-31T01:00:00.000Z',
    });
    expect(result).toMatchObject({ status: 'started' });
    expect(runs[0]).toMatchObject({
      originScheduledTaskId: 's1',
      permissionMode: 'confirm_each',
      goal: '整理下载目录',
    });
    expect(started).toHaveLength(1);
    expect(audit.list({ limit: 10 }).events[0]!.kind).toBe('scheduled_run_started');
    db.close();
  });

  it('模式不在无人值守白名单：拒绝启动并写 unattended_blocked', () => {
    const { db, audit, runner, runs } = setup();
    const result = runner.start({
      task: task(agentPayload({ permissionMode: 'full_access' })),
      scheduledAt: '2026-10-31T01:00:00.000Z',
    });
    expect(result).toMatchObject({ status: 'skipped', reason: 'UNATTENDED_MODE_NOT_ALLOWED' });
    expect(runs).toHaveLength(0);
    expect(audit.list({ limit: 10 }).events[0]!.reasonCode).toBe('UNATTENDED_MODE_NOT_ALLOWED');
    db.close();
  });

  it('同任务存在未结束运行：SKIPPED_ACTIVE_RUN', () => {
    const { db, runner, runs } = setup({ initialRuns: [activeRun({})] });
    const result = runner.start({
      task: task(agentPayload()),
      scheduledAt: '2026-10-31T01:00:00.000Z',
    });
    expect(result).toMatchObject({ status: 'skipped', reason: 'SKIPPED_ACTIVE_RUN' });
    expect(runs).toHaveLength(1);
    db.close();
  });

  it('并发上限：MAX_CONCURRENT_RUNS', () => {
    const { db, runner } = setup({
      policy: {
        unattended: { allowedModes: ['confirm_each'], maxConcurrentRuns: 1 },
      },
    });
    const first = runner.start({
      task: task(agentPayload(), 's1'),
      scheduledAt: '2026-10-31T01:00:00.000Z',
    });
    expect(first.status).toBe('started');
    const second = runner.start({
      task: task(agentPayload(), 's2'),
      scheduledAt: '2026-10-31T01:00:00.000Z',
    });
    expect(second).toMatchObject({ status: 'skipped', reason: 'MAX_CONCURRENT_RUNS' });
    db.close();
  });

  it('启动失败：运行标记 failed 并写 scheduled_run_finished', () => {
    const { db, audit, runner, runs } = setup({
      launch: () => {
        throw new Error('模型不具备视觉能力');
      },
    });
    const result = runner.start({
      task: task(agentPayload()),
      scheduledAt: '2026-10-31T01:00:00.000Z',
    });
    expect(result).toMatchObject({ status: 'failed', error: '模型不具备视觉能力' });
    expect(runs[0]!.status).toBe('failed');
    expect(audit.list({ limit: 10 }).events[0]).toMatchObject({
      kind: 'scheduled_run_finished',
      reasonCode: 'START_FAILED',
    });
    db.close();
  });
});
