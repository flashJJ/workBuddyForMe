import { describe, expect, it } from 'vitest';
import type { ConversationGoalView, WorkPlanView } from '@wbfm/shared/schemas';
import type { TaskCheckpoint, ToolTraceEntry } from '@wbfm/shared/types';
import {
  buildCheckpointPromptBlock,
  buildTaskCheckpointSnapshot,
  summarizeLastTool,
} from './task-checkpoint';

function goal(partial: Partial<ConversationGoalView> = {}): ConversationGoalView {
  return {
    id: 'g1',
    conversationId: 'c1',
    title: '发布 v2.26',
    successCriteria: null,
    status: 'active',
    createdAt: 't',
    updatedAt: 't',
    ...partial,
  } as ConversationGoalView;
}

function plan(
  status: WorkPlanView['status'],
  steps: Array<{ title: string; status: string }>,
): WorkPlanView {
  return {
    id: 'p1',
    conversationId: 'c1',
    goalId: null,
    kind: 'plan',
    title: '三步发布',
    status,
    origin: 'user',
    approvedAt: null,
    steps: steps.map((step, index) => ({ id: `s${index}`, ...step })),
    createdAt: 't',
    updatedAt: 't',
  } as unknown as WorkPlanView;
}

function trace(partial: Partial<ToolTraceEntry>): ToolTraceEntry {
  return {
    callId: 'call1',
    tool: 'shell',
    argsSummary: 'pnpm test',
    status: 'completed',
    durationMs: 12,
    resultSummary: '全部通过',
    startedAt: 't',
    ...partial,
  } as ToolTraceEntry;
}

describe('v2.26 P1 任务检查点', () => {
  it('有目标/计划时生成快照：待办、下一步、最近工具、TTL', () => {
    const snapshot = buildTaskCheckpointSnapshot(
      {
        goal: goal(),
        plan: plan('approved', [
          { title: '写迁移', status: 'done' },
          { title: '补单测', status: 'running' },
          { title: '提交', status: 'pending' },
        ]),
        todo: null,
      },
      { lastTrace: [trace({ tool: 'shell', resultSummary: 'pnpm test 通过' })], now: 0 },
    )!;
    expect(snapshot.goal).toBe('发布 v2.26');
    expect(snapshot.plan).toContain('三步发布');
    expect(snapshot.todos).toHaveLength(3);
    expect(snapshot.nextStep).toBe('补单测');
    expect(snapshot.lastToolSummary).toContain('pnpm test 通过');
    expect(snapshot.expiresAt).toBe(new Date(120 * 60_000).toISOString());
  });

  it('待评审计划不建执行检查点；步骤全终态且无目标 → null', () => {
    const reviewable = buildTaskCheckpointSnapshot({
      goal: null,
      plan: plan('pending_review', [{ title: '步骤', status: 'pending' }]),
      todo: null,
    });
    expect(reviewable).toBeNull();

    const finished = buildTaskCheckpointSnapshot({
      goal: null,
      plan: null,
      todo: plan('approved', [{ title: '步骤', status: 'done' }]),
    });
    expect(finished).toBeNull();
  });

  it('Todo 优先于计划；最近工具失败时保留错误信息', () => {
    const snapshot = buildTaskCheckpointSnapshot(
      {
        goal: null,
        plan: plan('approved', [{ title: '计划步骤', status: 'pending' }]),
        todo: plan('approved', [{ title: '待办步骤', status: 'pending' }]),
      },
      {
        lastTrace: [
          trace({ tool: 'browser', status: 'error', resultSummary: '', error: '连接超时' }),
        ],
      },
    )!;
    expect(snapshot.todos.map((todo) => todo.title)).toEqual(['待办步骤']);
    expect(snapshot.lastToolSummary).toContain('连接超时');
    expect(summarizeLastTool([])).toBeNull();
  });

  it('检查点渲染为 system 区块并标明归档规则', () => {
    const checkpoint = {
      id: 'cp1',
      conversationId: 'c1',
      taskRunId: null,
      status: 'active',
      goal: '发布 v2.26',
      plan: '《三步发布》已批准',
      todos: [{ title: '补单测', status: 'running' }],
      lastToolSummary: 'shell：全部通过',
      nextStep: '补单测',
      expiresAt: '2999-01-01T00:00:00.000Z',
      createdAt: 't',
      updatedAt: 't',
    } satisfies TaskCheckpoint;
    const block = buildCheckpointPromptBlock(checkpoint)!;
    expect(block).toContain('【任务检查点】');
    expect(block).toContain('目标：发布 v2.26');
    expect(block).toContain('- [进行中] 补单测');
    expect(block).toContain('下一步：补单测');
    expect(block).toContain('归档');
  });
});
