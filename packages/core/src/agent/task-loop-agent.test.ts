import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createDatabase, createTaskRunRepository, type DatabaseInstance } from '@wbfm/database';
import { resetDataRootForTest, setDataRootForTest } from '@wbfm/config';
import type { TaskRunView, TaskStepView } from '@wbfm/shared/schemas';
import { createWebCipher } from '../secrets/cipher';
import type { ServiceDeps } from '../services/deps';
import type { ToolContext } from '../tools/types';
import type { TaskPlanner } from './types';
import { runTaskLoop } from './task-loop';
import { toModelText } from '../i18n/system-text';
import { collect, makeRuntime, mockTool, okObserve, sequencePlanner } from './task-loop.helpers';

/**
 * v1.4 M2 task-loop 扩展：知识注入（T2.1）与 tool 观察模式（T2.2）。
 * 桌面 v0.7 原行为用例保留在 task-loop.test.ts。
 */
describe('任务 Agent 循环 v1.4 扩展（知识注入/tool 观察模式）', () => {
  let db: DatabaseInstance;
  let run: TaskRunView;

  beforeEach(() => {
    setDataRootForTest(mkdtempSync(join(tmpdir(), 'wbfm-taskloop-agent-')));
    db = createDatabase();
    const ts = '2026-10-11T00:00:00.000Z';
    db.prepare(`INSERT INTO assistants(id, name, created_at, updated_at) VALUES ('a1', 'A', ?, ?)`).run(ts, ts);
    db.prepare(`INSERT INTO conversations(id, assistant_id, title, created_at, updated_at) VALUES ('c1', 'a1', 'T', ?, ?)`).run(ts, ts);
    run = createTaskRunRepository(db).createRun({
      conversationId: 'c1',
      assistantId: 'a1',
      goal: '测试目标',
      maxSteps: 20,
    });
  });

  afterEach(() => {
    db.close();
    resetDataRootForTest();
  });

  const deps = (): ServiceDeps => ({ db, cipher: createWebCipher() });
  const stepsOf = () => createTaskRunRepository(db).listSteps(run.id);
  const kindsOf = (steps: TaskStepView[]) => steps.map((s) => `${s.kind}:${s.status}`);

  it('T2.1 知识注入：工具经 ctx 读到绑定知识库与检索片段，引用随步落库', async () => {
    const retrieved = [
      { documentId: 'd1', documentName: '制度.pdf', ordinal: 0, content: '年假 15 天', distance: 0.1, sourceUrl: null },
    ];
    const retrieve = vi.fn(async () => retrieved);
    const captured: { ctx: ToolContext | null } = { ctx: null };
    const knowledgeSearch = mockTool('knowledge_search', 'read', async (_args, ctx) => {
      captured.ctx = ctx ?? null;
      const chunks = await ctx!.retrieve('年假几天', 4);
      return {
        ok: true,
        output: chunks.map((c) => c.content).join('\n'),
        summary: `命中 ${chunks.length} 片`,
        citations: chunks.map((c, i) => ({
          documentId: c.documentId,
          documentName: c.documentName,
          ordinal: i + 1,
        })),
      };
    });
    const runtime = makeRuntime({
      screen_snapshot: mockTool('screen_snapshot', 'read', okObserve),
      knowledge_search: knowledgeSearch,
    });
    const planner = sequencePlanner([
      { action: 'tool', tool: 'knowledge_search', args: { query: '年假几天' }, reason: '查制度' },
      { action: 'done', reason: '已取证', message: '年假 15 天' },
    ]);

    const { final } = await collect(
      runTaskLoop({
        deps: deps(),
        runtime,
        planner,
        run,
        allowedTools: ['knowledge_search'],
        visionCapable: false,
        knowledgeBaseIds: ['kb-1'],
        retrieve,
      }),
    );

    expect(final.status).toBe('completed');
    expect(captured.ctx?.knowledgeBaseIds).toEqual(['kb-1']);
    expect(retrieve.mock.calls[0]!.slice(0, 2)).toEqual(['年假几天', 4]);
    const actionStep = stepsOf().find((s) => s.kind === 'action' && s.toolName === 'knowledge_search');
    expect(actionStep?.citations).toEqual([{ documentId: 'd1', documentName: '制度.pdf', ordinal: 1 }]);
    expect(actionStep?.resultJson).toContain('年假 15 天');
  });

  it('T2.2 tool 观察模式：不截图、观察步无截图、决策器收到 mode=tool', async () => {
    const screen = mockTool('screen_snapshot', 'read', okObserve);
    const runtime = makeRuntime({
      screen_snapshot: screen,
      window_list: mockTool('window_list', 'read', () =>
        Promise.resolve({ ok: true, output: '1 个窗口', summary: 'ok' })),
    });
    const modes: Array<string | undefined> = [];
    const planner: TaskPlanner = {
      decide: async (input) => {
        modes.push(input.observeMode);
        if (input.steps.filter((s) => s.kind === 'action').length === 0) {
          return { action: 'tool', tool: 'window_list', args: {}, reason: '列窗口' };
        }
        return { action: 'done', reason: '收尾', message: '完成' };
      },
    };

    const { final } = await collect(
      runTaskLoop({
        deps: deps(),
        runtime,
        planner,
        run,
        allowedTools: ['window_list'],
        visionCapable: false,
        observeMode: 'tool',
      }),
    );

    expect(final.status).toBe('completed');
    expect(modes.every((m) => m === 'tool')).toBe(true);
    expect(screen.run).not.toHaveBeenCalled();
    const steps = stepsOf();
    expect(kindsOf(steps)).toEqual([
      'observe:completed',
      'action:completed',
      'observe:completed',
      'final:completed',
    ]);
    expect(steps[0]?.screenshotPath).toBe('');
    expect(toModelText(steps[0]?.reason)).toBe('工具模式观察');
  });

  it('T2.1 缺省行为不变：不传知识参数时 ctx 为 null 知识库 + 空检索（桌面路径）', async () => {
    const captured: { ctx: ToolContext | null } = { ctx: null };
    const knowledgeSearch = mockTool('knowledge_search', 'read', async (_args, ctx) => {
      captured.ctx = ctx ?? null;
      const chunks = await ctx!.retrieve('q', 4);
      return { ok: true, output: `${chunks.length}`, summary: 'ok' };
    });
    const runtime = makeRuntime({
      screen_snapshot: mockTool('screen_snapshot', 'read', okObserve),
      knowledge_search: knowledgeSearch,
    });
    const planner = sequencePlanner([
      { action: 'tool', tool: 'knowledge_search', args: {}, reason: 'r' },
      { action: 'done', reason: 'ok', message: '完成' },
    ]);

    const { final } = await collect(
      runTaskLoop({ deps: deps(), runtime, planner, run, allowedTools: ['knowledge_search'], visionCapable: false }),
    );

    expect(final.status).toBe('completed');
    expect(captured.ctx?.knowledgeBaseIds).toEqual([]);
    await expect(captured.ctx!.retrieve('q', 1)).resolves.toEqual([]);
  });
});
