import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createAgentRunRepository, createDatabase, type DatabaseInstance } from '@wbfm/database';
import { resetDataRootForTest, setDataRootForTest } from '@wbfm/config';
import { createAgentRunner } from './index';
import { callWithFallback } from './runner-fallbacks';
import { toModelText } from '../i18n/system-text';
import {
  START_INPUT,
  collect,
  scriptedClients,
  subtask,
  verdict,
} from './agent-runner-harness';

/**
 * 角色协议连续失败的降级容错（从 agent-runner.test.ts 拆出以满足 300 行门禁）：
 * Planner 失败→原目标直派（保留工具域）；Reviewer 失败→标注自动通过。
 */
describe('agent-runner 降级容错', () => {
  let db: DatabaseInstance;

  beforeEach(() => {
    const tempRoot = mkdtempSync(join(tmpdir(), 'wbfm-agent-fallback-'));
    setDataRootForTest(tempRoot);
    db = createDatabase(':memory:');
  });

  afterEach(() => {
    db.close();
    resetDataRootForTest();
  });

  it('Planner 连续失败降级为原目标直派（handoff 标题标注降级）', async () => {
    const clients = scriptedClients({
      plans: [{ throw: new Error('bad json') }, { throw: new Error('bad json') }],
      verdicts: [verdict('approve')],
    });
    const repo = createAgentRunRepository(db);
    await collect(createAgentRunner({ repo, clients }).run(START_INPUT));

    expect(clients.planCalls).toBe(2);
    const run = repo.list()[0]!;
    expect(run.status).toBe('done');
    const firstHandoff = repo.listHandoffs(run.id)[0]!;
    expect(toModelText(firstHandoff.payload.subtask?.title ?? '')).toContain('降级派单');
    expect(toModelText(firstHandoff.payload.subtask?.brief ?? '')).toContain('完成目标 G');
  });

  it('降级派单保留可用工具域且不收敛知识库（Executor 可继续检索绑定库）', async () => {
    const clients = scriptedClients({
      plans: [{ throw: new Error('bad json') }, { throw: new Error('bad json') }],
      verdicts: [verdict('approve')],
    });
    const repo = createAgentRunRepository(db);
    await collect(
      createAgentRunner({ repo, clients }).run({
        ...START_INPUT,
        availableToolScopes: ['knowledge'],
        knowledgeBaseHints: [{ id: 'kb1', name: '我的简历' }],
      }),
    );

    const run = repo.list()[0]!;
    const fallback = repo.listHandoffs(run.id)[0]!.payload.subtask!;
    expect(toModelText(fallback.title)).toContain('降级派单');
    expect(fallback.toolScopes).toEqual(['knowledge']);
    // 不指定单库：Executor 继承助手/节点绑定的全部知识库
    expect(fallback.knowledgeBaseId).toBeUndefined();
  });

  it('Reviewer 连续失败降级为标注自动通过', async () => {
    const clients = scriptedClients({
      plans: [subtask()],
      verdicts: [{ throw: new Error('e1') }, { throw: new Error('e2') }],
    });
    const repo = createAgentRunRepository(db);
    await collect(createAgentRunner({ repo, clients }).run(START_INPUT));

    expect(clients.reviewCalls).toBe(2);
    const run = repo.list()[0]!;
    expect(run.status).toBe('done');
    const reviewHandoff = repo.listHandoffs(run.id)[2]!;
    expect(reviewHandoff.payload.verdict).toBe('approve');
    expect(toModelText(reviewHandoff.payload.reviewNotes ?? '')).toContain('自动通过');
  });
});

describe('callWithFallback 协议容错原语', () => {
  it('首次成功：直接返回且 degraded=false', async () => {
    const r = await callWithFallback('t', async () => 'ok', 2, () => 'fb');
    expect(r).toEqual({ value: 'ok', degraded: false });
  });

  it('连续失败达上限：返回 fallback 且 degraded=true', async () => {
    let calls = 0;
    const r = await callWithFallback(
      't',
      async () => {
        calls += 1;
        throw new Error('bad');
      },
      2,
      () => 'fb',
    );
    expect(calls).toBe(2);
    expect(r).toEqual({ value: 'fb', degraded: true });
  });

  it('signal 已中止：错误立即上抛，不重试也不降级', async () => {
    const controller = new AbortController();
    controller.abort();
    let calls = 0;
    await expect(
      callWithFallback(
        't',
        async () => {
          calls += 1;
          throw new Error('aborted');
        },
        2,
        () => 'fb',
        controller.signal,
      ),
    ).rejects.toThrow('aborted');
    expect(calls).toBe(1);
  });
});
