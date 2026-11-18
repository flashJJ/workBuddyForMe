import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { AgentRunView } from '@wbfm/shared/schemas';
import type { ServiceDeps } from '../services/base/deps';
import { createTestDb, type TestDb } from '../agents/runner/agent-run-test-harness';
import { buildTaskMemoryContent, recordAgentRunMemory } from './task-memory';

function runFixture(overrides: Partial<AgentRunView> = {}): AgentRunView {
  return {
    id: 'run-1',
    conversationId: 'c1',
    flowRunId: null,
    nodeExecutionId: null,
    assistantId: 'a1',
    goal: '整理本周会议纪要',
    status: 'done',
    roundNo: 0,
    budget: { maxRounds: 3, maxSteps: 20, maxTotalTokens: 80_000 },
    finalOutcome: {
      summary: '已汇总 3 场会议，输出待办 5 条。',
      evidence: [{ documentName: '会议纪要.docx' } as never],
      toolCalls: ['knowledge_search'],
      unfinished: ['补发邀请函'],
    },
    promptTokens: 100,
    completionTokens: 50,
    totalTokens: 150,
    errorCode: null,
    errorMessage: null,
    createdAt: 't',
    updatedAt: 't',
    ...overrides,
  };
}

describe('buildTaskMemoryContent（任务经验沉淀）', () => {
  it('成功任务包含目标/结论/证据/未竟项', () => {
    const content = buildTaskMemoryContent(runFixture())!;
    expect(content).toContain('任务「整理本周会议纪要」成功完成');
    expect(content).toContain('已汇总 3 场会议');
    expect(content).toContain('证据：会议纪要.docx');
    expect(content).toContain('未竟事项：补发邀请函');
  });

  it('失败任务包含原因与已产出结论', () => {
    const content = buildTaskMemoryContent(
      runFixture({ status: 'failed', errorMessage: '知识库未绑定' }),
    )!;
    expect(content).toContain('未成功（失败）');
    expect(content).toContain('知识库未绑定');
    expect(content).toContain('已产出：已汇总 3 场会议');
  });

  it('预算触顶：标注预算触顶并保留最佳结果', () => {
    const content = buildTaskMemoryContent(runFixture({ status: 'budget_exceeded' }))!;
    expect(content).toContain('预算触顶');
    expect(content).toContain('已汇总 3 场会议');
  });

  it('无结论且无错误时返回 null', () => {
    expect(
      buildTaskMemoryContent(runFixture({ finalOutcome: null, errorMessage: null })),
    ).toBeNull();
  });
});

describe('recordAgentRunMemory', () => {
  let testDb: TestDb;
  let deps: ServiceDeps;

  beforeEach(() => {
    testDb = createTestDb();
    testDb.db.exec(
      "INSERT INTO assistants(id,name,memory_enabled,created_at,updated_at) VALUES('a1','测试助手',1,'t','t')",
    );
    deps = { db: testDb.db } as ServiceDeps;
  });

  afterEach(() => {
    testDb.cleanup();
  });

  it('终态任务写入 assistant 作用域记忆', async () => {
    await recordAgentRunMemory(deps, runFixture());
    const rows = testDb.db
      .prepare('SELECT content, kind, importance FROM memories WHERE assistant_id=?')
      .all('a1') as Array<{ content: string; kind: string; importance: number }>;
    expect(rows).toHaveLength(1);
    expect(rows[0]!.kind).toBe('event');
    expect(rows[0]!.content).toContain('整理本周会议纪要');
    expect(rows[0]!.importance).toBeCloseTo(0.55);
  });

  it('助手关闭记忆或运行中不写入', async () => {
    testDb.db.prepare('UPDATE assistants SET memory_enabled=0 WHERE id=?').run('a1');
    await recordAgentRunMemory(deps, runFixture());
    await recordAgentRunMemory(deps, runFixture({ status: 'running' }));
    const count = testDb.db
      .prepare('SELECT COUNT(*) AS n FROM memories WHERE assistant_id=?')
      .get('a1') as { n: number };
    expect(count.n).toBe(0);
  });
});
