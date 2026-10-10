import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createAgentRunRepository, createDatabase, type DatabaseInstance } from '@wbfm/database';
import { resetDataRootForTest, setDataRootForTest } from '@wbfm/config';
import type {
  ExecutorOutcome,
  ReviewVerdictPayload,
  SubtaskSpec,
} from '@wbfm/shared/schemas';
import { createAgentRunner, type AgentClients, type AgentRunEvent } from '../agents/index';

/** 收集异步生成器全部事件 */
async function collect(
  gen: AsyncGenerator<AgentRunEvent>,
): Promise<AgentRunEvent[]> {
  const events: AgentRunEvent[] = [];
  for (;;) {
    const r = await gen.next();
    if (r.done) break;
    events.push(r.value);
  }
  return events;
}

const names = (events: AgentRunEvent[]) => events.map((e) => e.event);
const handoffPairs = (events: AgentRunEvent[]) =>
  events
    .filter((e): e is Extract<AgentRunEvent, { event: 'agent_handoff' }> => e.event === 'agent_handoff')
    .map((e) => `${e.data.handoff.fromRole}→${e.data.handoff.toRole}`);

function subtask(title = '子任务'): SubtaskSpec {
  return { title, brief: `${title}说明`, acceptance: ['标准1'] };
}
function outcome(summary = '交付结论'): ExecutorOutcome {
  return { summary, evidence: [], toolCalls: [], unfinished: [] };
}
/** 脚本化裁决（acceptanceResults 在 zod 输出类型中必填，缺省空数组） */
function verdict(value: ReviewVerdictPayload['verdict'], reviewNotes?: string): ReviewVerdictPayload {
  return { verdict: value, acceptanceResults: [], ...(reviewNotes ? { reviewNotes } : {}) };
}

/** 脚本化客户端工厂：按队列返回结果，失败用 reject 控制 */
function scriptedClients(script: {
  plans: Array<SubtaskSpec | { throw: Error }>;
  verdicts: Array<ReviewVerdictPayload | { throw: Error }>;
  outcomes?: ExecutorOutcome[];
  execFails?: number;
}): AgentClients & { planCalls: number; reviewCalls: number; execCalls: number } {
  const state = { planCalls: 0, reviewCalls: 0, execCalls: 0 };
  const clients = {
    planner: {
      async plan() {
        const i = state.planCalls++;
        const item = script.plans[i] ?? script.plans[script.plans.length - 1]!;
        if ('throw' in item) throw item.throw;
        return { subtask: item, usage: { promptTokens: 10, completionTokens: 5 } };
      },
    },
    executor: {
      async run() {
        state.execCalls++;
        if (script.execFails && state.execCalls <= script.execFails) throw new Error('执行器故障');
        const o = script.outcomes?.[state.execCalls - 1] ?? outcome();
        return { outcome: o, usage: { promptTokens: 20, completionTokens: 10 }, steps: 2 };
      },
    },
    reviewer: {
      async review() {
        const i = state.reviewCalls++;
        const item = script.verdicts[i] ?? script.verdicts[script.verdicts.length - 1]!;
        if ('throw' in item) throw item.throw;
        return { review: item, usage: { promptTokens: 8, completionTokens: 4 } };
      },
    },
    get planCalls() { return state.planCalls; },
    get reviewCalls() { return state.reviewCalls; },
    get execCalls() { return state.execCalls; },
  } as AgentClients & { planCalls: number; reviewCalls: number; execCalls: number };
  return clients;
}

describe('agent-runner-service 协作五场景', () => {
  let db: DatabaseInstance;
  let tempRoot: string;

  beforeEach(() => {
    tempRoot = mkdtempSync(join(tmpdir(), 'wbfm-agent-runner-'));
    setDataRootForTest(tempRoot);
    db = createDatabase(':memory:');
  });

  afterEach(() => {
    db.close();
    resetDataRootForTest();
  });

  const startInput = { assistantId: 'a', goal: '完成目标 G' };

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
    expect(run.finalOutcome?.unfinished.join()).toContain('预算触顶');
  });

  it('场景④Planner 连续失败降级为原目标直派（handoff 标题标注降级）', async () => {
    const clients = scriptedClients({
      plans: [{ throw: new Error('bad json') }, { throw: new Error('bad json') }],
      verdicts: [verdict('approve')],
    });
    const repo = createAgentRunRepository(db);
    await collect(createAgentRunner({ repo, clients }).run(startInput));

    expect(clients.planCalls).toBe(2);
    const run = repo.list()[0]!;
    expect(run.status).toBe('done');
    const firstHandoff = repo.listHandoffs(run.id)[0]!;
    expect(firstHandoff.payload.subtask?.title).toContain('降级派单');
    expect(firstHandoff.payload.subtask?.brief).toContain('完成目标 G');
  });

  it('场景④b Reviewer 连续失败降级为标注自动通过', async () => {
    const clients = scriptedClients({
      plans: [subtask()],
      verdicts: [{ throw: new Error('e1') }, { throw: new Error('e2') }],
    });
    const repo = createAgentRunRepository(db);
    await collect(createAgentRunner({ repo, clients }).run(startInput));

    expect(clients.reviewCalls).toBe(2);
    const run = repo.list()[0]!;
    expect(run.status).toBe('done');
    const reviewHandoff = repo.listHandoffs(run.id)[2]!;
    expect(reviewHandoff.payload.verdict).toBe('approve');
    expect(reviewHandoff.payload.reviewNotes).toContain('自动通过');
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
