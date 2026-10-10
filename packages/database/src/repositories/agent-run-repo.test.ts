import { describe, expect, it } from 'vitest';
import {
  AGENT_BUDGET_DEFAULTS,
  type ExecutorOutcome,
} from '@wbfm/shared/schemas';
import { createDatabase, type DatabaseInstance } from '../client';
import { createAgentRunRepository } from './agent-run-repo';

function seed(db: DatabaseInstance): { assistantId: string; conversationId: string } {
  const ts = '2026-10-11T00:00:00.000Z';
  db.prepare(`INSERT INTO assistants(id,name,created_at,updated_at) VALUES('a','助手',?,?)`).run(
    ts,
    ts,
  );
  db.prepare(
    `INSERT INTO conversations(id,assistant_id,title,created_at,updated_at) VALUES('c','a','t',?,?)`,
  ).run(ts, ts);
  return { assistantId: 'a', conversationId: 'c' };
}

const outcome: ExecutorOutcome = {
  summary: '结论',
  evidence: [{ ordinal: 1, documentId: 'd', documentName: 'f.txt', staticKind: 'chunk' }],
  toolCalls: ['knowledge_search'],
  unfinished: [],
};

describe('agent-run-repo 运行生命周期', () => {
  it('创建默认预算取 DDL 默认；两入口外键可空', () => {
    const db = createDatabase(':memory:');
    const { assistantId } = seed(db);
    const repo = createAgentRunRepository(db);

    const run = repo.create({ assistantId, goal: '目标' });
    expect(run.status).toBe('running');
    expect(run.roundNo).toBe(0);
    expect(run.conversationId).toBeNull();
    expect(run.flowRunId).toBeNull();
    expect(run.budget).toEqual(AGENT_BUDGET_DEFAULTS);
    expect(run.finalOutcome).toBeNull();
    expect(run.totalTokens).toBe(0);

    const run2 = repo.create({
      assistantId,
      conversationId: 'c',
      goal: 'g2',
      budget: { maxRounds: 1, maxSteps: 5, maxTotalTokens: 20000 },
    });
    expect(run2.conversationId).toBe('c');
    expect(run2.budget.maxRounds).toBe(1);
    expect(run2.budget.maxTotalTokens).toBe(20000);
    db.close();
  });

  it('getById 不存在返回 null', () => {
    const db = createDatabase(':memory:');
    expect(createAgentRunRepository(db).getById('nope')).toBeNull();
    db.close();
  });

  it('setRound/addTokens 累加；终态后拒绝再写', () => {
    const db = createDatabase(':memory:');
    const { assistantId } = seed(db);
    const repo = createAgentRunRepository(db);
    const run = repo.create({ assistantId, goal: 'g' });

    repo.setRound(run.id, 1);
    expect(repo.getById(run.id)!.roundNo).toBe(1);

    repo.addTokens(run.id, { promptTokens: 100, completionTokens: 50 });
    repo.addTokens(run.id, { promptTokens: 20, completionTokens: -99 });
    const updated = repo.getById(run.id)!;
    expect(updated.promptTokens).toBe(120);
    expect(updated.completionTokens).toBe(50);
    expect(updated.totalTokens).toBe(170);

    repo.finalize(run.id, { status: 'done', finalOutcome: outcome });
    expect(() => repo.setRound(run.id, 2)).toThrow(/终态/);
    expect(() => repo.addTokens(run.id, { promptTokens: 1 })).toThrow(/终态/);
    db.close();
  });

  it('finalize 各终态：done 带交付；failed 带错误码；outcome 坏 JSON 读回 null', () => {
    const db = createDatabase(':memory:');
    const { assistantId } = seed(db);
    const repo = createAgentRunRepository(db);
    const r1 = repo.create({ assistantId, goal: 'g1' });
    const done = repo.finalize(r1.id, {
      status: 'done',
      finalOutcome: outcome,
    });
    expect(done.status).toBe('done');
    expect(done.finalOutcome?.summary).toBe('结论');
    expect(done.finalOutcome?.evidence).toHaveLength(1);

    const r2 = repo.create({ assistantId, goal: 'g2' });
    const failed = repo.finalize(r2.id, {
      status: 'budget_exceeded',
      errorCode: 'BUDGET_EXCEEDED',
      errorMessage: '轮次超限',
      finalOutcome: outcome,
    });
    expect(failed.status).toBe('budget_exceeded');
    expect(failed.errorCode).toBe('BUDGET_EXCEEDED');
    expect(failed.finalOutcome?.toolCalls).toEqual(['knowledge_search']);
    db.close();
  });

  it('不存在的运行写入抛错', () => {
    const db = createDatabase(':memory:');
    const repo = createAgentRunRepository(db);
    expect(() => repo.setRound('x', 1)).toThrow(/不存在/);
    db.close();
  });
});

describe('agent-run-repo 交接流水', () => {
  it('seq 轮内自增、按轮次序号有序读出；载荷落库可回放', () => {
    const db = createDatabase(':memory:');
    const { assistantId } = seed(db);
    const repo = createAgentRunRepository(db);
    const run = repo.create({ assistantId, goal: 'g' });

    repo.addHandoff({
      runId: run.id,
      roundNo: 0,
      fromRole: 'planner',
      toRole: 'executor',
      payload: { subtask: { title: 't', brief: 'b', acceptance: ['a'] } },
    });
    repo.addHandoff({
      runId: run.id,
      roundNo: 0,
      fromRole: 'executor',
      toRole: 'reviewer',
      payload: { outcome: { summary: 's', evidence: [], toolCalls: [], unfinished: [] } },
    });
    repo.addHandoff({
      runId: run.id,
      roundNo: 1,
      fromRole: 'planner',
      toRole: 'executor',
      payload: { subtask: { title: 't2', brief: 'b2', acceptance: ['a'] } },
    });

    const hs = repo.listHandoffs(run.id);
    expect(hs.map((h) => [h.roundNo, h.seq])).toEqual([
      [0, 0],
      [0, 1],
      [1, 0],
    ]);
    expect(hs[0]!.payload.subtask?.title).toBe('t');
    expect(hs[1]!.payload.outcome?.summary).toBe('s');
    expect(hs[2]!.fromRole).toBe('planner');
    expect(hs[2]!.toRole).toBe('executor');
    db.close();
  });

  it('非法交接载荷（三类字段全缺）被拒', () => {
    const db = createDatabase(':memory:');
    const { assistantId } = seed(db);
    const repo = createAgentRunRepository(db);
    const run = repo.create({ assistantId, goal: 'g' });
    expect(() =>
      repo.addHandoff({
        runId: run.id,
        roundNo: 0,
        fromRole: 'planner',
        toRole: 'executor',
        payload: {} as never,
      }),
    ).toThrow(/非法交接载荷/);
    db.close();
  });

  it('终态后追加交接被拒', () => {
    const db = createDatabase(':memory:');
    const { assistantId } = seed(db);
    const repo = createAgentRunRepository(db);
    const run = repo.create({ assistantId, goal: 'g' });
    repo.finalize(run.id, { status: 'cancelled' });
    expect(() =>
      repo.addHandoff({
        runId: run.id,
        roundNo: 0,
        fromRole: 'reviewer',
        toRole: 'user',
        payload: { verdict: 'approve' },
      }),
    ).toThrow(/终态/);
    db.close();
  });

  it('级联：删除运行时交接流水一并删除', () => {
    const db = createDatabase(':memory:');
    const { assistantId } = seed(db);
    const repo = createAgentRunRepository(db);
    const run = repo.create({ assistantId, goal: 'g' });
    repo.addHandoff({
      runId: run.id,
      roundNo: 0,
      fromRole: 'reviewer',
      toRole: 'user',
      payload: { verdict: 'approve' },
    });
    db.prepare(`DELETE FROM agent_runs WHERE id=?`).run(run.id);
    expect(repo.listHandoffs(run.id)).toHaveLength(0);
    db.close();
  });
});

describe('agent-run-repo 列表过滤', () => {
  it('按会话过滤与默认时间倒序', () => {
    const db = createDatabase(':memory:');
    const { assistantId, conversationId } = seed(db);
    const repo = createAgentRunRepository(db);
    repo.create({ assistantId, conversationId, goal: 'a' });
    repo.create({ assistantId, goal: 'b' });
    repo.create({ assistantId, conversationId, goal: 'c' });

    expect(repo.list()).toHaveLength(3);
    expect(repo.list({ conversationId })).toHaveLength(2);
    expect(repo.list({ limit: 1 })).toHaveLength(1);
    db.close();
  });
});
