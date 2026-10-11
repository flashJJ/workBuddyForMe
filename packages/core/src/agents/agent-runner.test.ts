import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createAgentRunRepository, createDatabase, type DatabaseInstance } from '@wbfm/database';
import { resetDataRootForTest, setDataRootForTest } from '@wbfm/config';
import { createAgentRunner, type AgentClients, type AgentRunEvent } from './index';
import { toModelTexts } from '../i18n/system-text';
import {
  START_INPUT,
  collect,
  handoffPairs,
  names,
  outcome,
  scriptedClients,
  subtask,
  verdict,
} from './agent-runner-harness';

describe('agent-runner-service 协作五场景', () => {
  let db: DatabaseInstance;

  beforeEach(() => {
    const tempRoot = mkdtempSync(join(tmpdir(), 'wbfm-agent-runner-'));
    setDataRootForTest(tempRoot);
    db = createDatabase(':memory:');
  });

  afterEach(() => {
    db.close();
    resetDataRootForTest();
  });

  const startInput = START_INPUT;

  it('场景①一次通过：三角色各一次，交接序列与终态正确', async () => {
    const clients = scriptedClients({
      plans: [subtask('首轮')],
      verdicts: [verdict('approve')],
    });
    const repo = createAgentRunRepository(db);
    const events = await collect(createAgentRunner({ repo, clients }).run(startInput));

    expect(handoffPairs(events)).toEqual([
      'planner→executor',
      'executor→reviewer',
      'reviewer→user',
    ]);
    const phases = events
      .filter((e): e is Extract<AgentRunEvent, { event: 'agent_phase' }> => e.event === 'agent_phase')
      .map((e) => `${e.data.role ?? '-'}:${e.data.phase}`);
    expect(phases).toContain('planner:planning');
    expect(phases).toContain('executor:executing');
    expect(phases).toContain('reviewer:reviewing');
    expect(phases.at(-1)).toBe('-:done');

    const run = repo.list()[0]!;
    expect(run.status).toBe('done');
    expect(run.roundNo).toBe(0);
    expect(run.finalOutcome?.summary).toBe('交付结论');
    expect(run.totalTokens).toBe(15 + 30 + 12);
    expect(repo.listHandoffs(run.id)).toHaveLength(3);
    expect(clients.planCalls).toBe(1);
    expect(clients.execCalls).toBe(1);
    expect(clients.reviewCalls).toBe(1);
  });

  it('场景②返工一次后通过：第二轮 planner 重派、2 轮交接、共 5 条交接', async () => {
    const clients = scriptedClients({
      plans: [subtask('第一版'), subtask('修订版')],
      verdicts: [verdict('revise', '缺证据'), verdict('approve')],
      outcomes: [outcome('粗糙结论'), outcome('完善结论')],
    });
    const repo = createAgentRunRepository(db);
    const events = await collect(createAgentRunner({ repo, clients }).run(startInput));

    expect(handoffPairs(events)).toEqual([
      'planner→executor',
      'executor→reviewer',
      'reviewer→planner',
      'planner→executor',
      'executor→reviewer',
      'reviewer→user',
    ]);
    const run = repo.list()[0]!;
    expect(run.status).toBe('done');
    expect(run.roundNo).toBe(1);
    expect(run.finalOutcome?.summary).toBe('完善结论');
    // 第二轮 planner 上下文应含首轮审查
    expect(clients.planCalls).toBe(2);
  });

  it('场景③reject 超轮次：maxRounds=1 时 revise 终态 budget_exceeded 并交付最佳结果+未竟注记', async () => {
    const clients = scriptedClients({
      plans: [subtask()],
      verdicts: [verdict('revise', '永远不达标')],
    });
    const repo = createAgentRunRepository(db);
    await collect(
      createAgentRunner({ repo, clients }).run({ ...startInput, budget: { maxRounds: 1 } }),
    );

    const run = repo.list()[0]!;
    expect(run.status).toBe('budget_exceeded');
    expect(run.errorCode).toBe('AGENT_BUDGET_EXCEEDED');
    expect(toModelTexts(run.finalOutcome?.unfinished ?? []).join()).toContain('预算触顶');
  });

  it('场景⑤急停：cancel 后 1 个动作内停止，status=cancelled 不再调用后续角色', async () => {
    const controller = new AbortController();
    const clients = scriptedClients({
      plans: [subtask()],
      verdicts: [verdict('approve')],
    });
    // planner 返回后、executor 执行前 abort：executor 应感知 abort 抛出
    (clients.executor as { run: () => Promise<never> }).run = async () => {
      controller.abort();
      throw new Error('aborted');
    };
    const repo = createAgentRunRepository(db);
    const events = await collect(
      createAgentRunner({ repo, clients }).run({ ...startInput, signal: controller.signal }),
    );

    const run = repo.list()[0]!;
    expect(run.status).toBe('cancelled');
    expect(run.errorCode).toBe('AGENT_CANCELLED');
    expect(clients.reviewCalls).toBe(0);
    expect(names(events)).toContain('done');
    expect(names(events)).not.toContain('agent_review');
  });

  it('执行器硬错误：终态 failed + error 帧', async () => {
    const clients = scriptedClients({
      plans: [subtask()],
      verdicts: [verdict('approve')],
      execFails: 99,
    });
    const repo = createAgentRunRepository(db);
    const events = await collect(createAgentRunner({ repo, clients }).run(startInput));
    const run = repo.list()[0]!;
    expect(run.status).toBe('failed');
    expect(names(events)).toContain('error');
    expect(names(events)).toContain('done');
  });

  it('M4 HITL：executor 门控帧桥接为 agent_tool_confirm（runId/taskScope 齐全）后正常收敛', async () => {
    const clients = scriptedClients({
      plans: [subtask()],
      verdicts: [verdict('approve')],
    });
    (clients.executor as { run: AgentClients['executor']['run'] }).run = async (input) => {
      input.emitGateConfirm?.({
        callId: 'call-1',
        tool: 'mouse_click',
        permission: 'danger',
        argsSummary: '{"x":100}',
        taskScope: 'task-9',
      });
      return { outcome: outcome(), usage: { promptTokens: 20, completionTokens: 10 }, steps: 1 };
    };
    const repo = createAgentRunRepository(db);
    const events = await collect(createAgentRunner({ repo, clients }).run(startInput));

    const confirm = events.find((e) => e.event === 'agent_tool_confirm');
    expect(confirm).toBeDefined();
    expect(confirm!.data).toMatchObject({
      callId: 'call-1',
      tool: 'mouse_click',
      permission: 'danger',
      taskScope: 'task-9',
    });
    expect(confirm!.data.runId).toBeTruthy();
    // 时序：门控帧在执行阶段下发，早于 executor→reviewer 交接
    const order = names(events);
    const idx = order.indexOf('agent_tool_confirm');
    expect(order.slice(0, idx)).toContain('agent_phase');
    expect(order.slice(idx + 1)).toContain('agent_handoff');
    expect(repo.list()[0]!.status).toBe('done');
  });

  it('reject 裁决：终态 failed/AGENT_REJECTED 但保留交付物', async () => {
    const clients = scriptedClients({
      plans: [subtask()],
      verdicts: [verdict('reject', '前提错误，资料不存在')],
    });
    const repo = createAgentRunRepository(db);
    await collect(createAgentRunner({ repo, clients }).run(startInput));
    const run = repo.list()[0]!;
    expect(run.status).toBe('failed');
    expect(run.errorCode).toBe('AGENT_REJECTED');
    expect(run.errorMessage).toContain('资料不存在');
    expect(run.finalOutcome?.summary).toBe('交付结论');
  });
});
