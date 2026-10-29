import { describe, expect, it } from 'vitest';
import type { AgentRunView, FlowEventPayload, TaskEventPayload, TaskRunView, WorkflowRunView } from '@wbfm/shared';
import { applyFlowEvent } from './map-flow';
import { applyTaskEvent } from './map-task';
import { applyAgentEvent } from './map-agent';
import type { AgentRunEvent } from '../agents/agent-runner';

const taskRun: TaskRunView = {
  id: 't1',
  conversationId: 'c1',
  assistantId: 'a1',
  goal: '整理资料并回答',
  status: 'running',
  stepCount: 0,
  failureCount: 0,
  maxSteps: 10,
  stopReason: null,
  createdAt: '2026-10-28T23:59:00.000Z',
  updatedAt: '2026-10-28T23:59:00.000Z',
  finishedAt: null,
};

const flowRun: WorkflowRunView = {
  id: 'r1',
  workflowId: 'w1',
  version: 1,
  trigger: 'manual',
  status: 'running',
  input: {},
  output: null,
  error: null,
  conversationId: null,
  waitNodeId: null,
  startedAt: '2026-10-28T23:59:00.000Z',
  finishedAt: null,
  createdAt: '2026-10-28T23:59:00.000Z',
  endpointId: null,
  parentRunId: null,
  resumedFromNode: null,
  interruptReason: null,
};

const agentRun: AgentRunView = {
  id: 'g1',
  conversationId: 'c1',
  flowRunId: null,
  nodeExecutionId: null,
  assistantId: 'a1',
  goal: '协作调研',
  status: 'running',
  roundNo: 0,
  budget: { maxSteps: 20, maxRounds: 3, maxTotalTokens: 150000 },
  finalOutcome: null,
  promptTokens: 0,
  completionTokens: 0,
  totalTokens: 0,
  errorCode: null,
  errorMessage: null,
  createdAt: '2026-10-28T23:59:00.000Z',
  updatedAt: '2026-10-28T23:59:00.000Z',
};

describe('WorkSignal 事件映射', () => {
  it('task：启动 → 工具步 → 完成', () => {
    const started = applyTaskEvent(undefined, taskRun, {
      type: 'run_started',
      runId: 't1',
      conversationId: 'c1',
      run: taskRun,
    } satisfies TaskEventPayload);
    expect(started?.outcome).toBe('running');
    expect(started?.deepLink).toBe('/tasks?run=t1');

    const step = applyTaskEvent(started!, taskRun, {
      type: 'step_started',
      runId: 't1',
      conversationId: 'c1',
      step: {
        id: 's1',
        runId: 't1',
        stepIndex: 0,
        kind: 'action',
        toolName: 'knowledge_search',
        reason: '查资料',
        argsJson: '{}',
        resultJson: '',
        screenshotPath: '',
        status: 'running',
        error: '',
        durationMs: 0,
        createdAt: '2026-10-28T23:59:01.000Z',
      },
    } satisfies TaskEventPayload);
    expect(step?.activity).toBe('searching');
    expect(step?.stepLabel).toContain('第 1 步');

    const done = applyTaskEvent(step!, taskRun, {
      type: 'run_finished',
      runId: 't1',
      conversationId: 'c1',
      run: {
        ...taskRun,
        status: 'completed',
        stopReason: 'completed',
        stepCount: 1,
        finishedAt: '2026-10-28T23:59:30.000Z',
      },
    } satisfies TaskEventPayload);
    expect(done?.outcome).toBe('succeeded');
    expect(done?.endedAt).toBe('2026-10-28T23:59:30.000Z');
  });

  it('flow：启动 → 等待人工 → 成功', () => {
    const started = applyFlowEvent(undefined, flowRun, {
      type: 'run_started',
      runId: 'r1',
      workflowId: 'w1',
      version: 1,
      trigger: 'manual',
    } satisfies FlowEventPayload, '发布流程');
    expect(started?.title).toBe('发布流程');
    expect(started?.deepLink).toBe('/flows/w1?run=r1');

    const waiting = applyFlowEvent(started!, flowRun, {
      type: 'node_waiting_human',
      runId: 'r1',
      workflowId: 'w1',
      nodeId: 'review',
    } satisfies FlowEventPayload, '发布流程');
    expect(waiting?.outcome).toBe('waiting');
    expect(waiting?.attention).toBe('input');

    const done = applyFlowEvent(waiting!, flowRun, {
      type: 'run_succeeded',
      runId: 'r1',
      workflowId: 'w1',
      output: { ok: true },
    } satisfies FlowEventPayload, '发布流程');
    expect(done?.outcome).toBe('succeeded');
  });

  it('agent：阶段 → 完成', () => {
    const phase: AgentRunEvent = {
      event: 'agent_phase',
      data: { runId: 'g1', phase: 'executing', role: 'executor', round: 0 },
    };
    const started = applyAgentEvent(undefined, agentRun, phase);
    expect(started?.outcome).toBe('running');
    expect(started?.activity).toBe('executing');
    expect(started?.deepLink).toBe('/chat?conversation=c1');

    const done: AgentRunEvent = {
      event: 'done',
      data: { content: '完成', usage: null },
    };
    const finished = applyAgentEvent(started!, agentRun, done);
    expect(finished?.outcome).toBe('succeeded');
  });
});
