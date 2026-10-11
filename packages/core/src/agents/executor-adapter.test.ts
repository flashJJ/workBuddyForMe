import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  createAgentRunRepository,
  createDatabase,
  createTaskRunRepository,
  type DatabaseInstance,
} from '@wbfm/database';
import { resetDataRootForTest, setDataRootForTest } from '@wbfm/config';
import type { AgentRunView, SubtaskSpec } from '@wbfm/shared/schemas';
import { createWebCipher } from '../secrets/cipher';
import type { ServiceDeps } from '../services/deps';
import type { TaskPlanner, TaskPlannerInput } from '../agent/types';
import { makeRuntime, mockTool, okObserve, sequencePlanner } from '../agent/task-loop.helpers';
import { createExecutorAdapter, resolveAllowedTools, type ObserveMode } from './executor-adapter';

function makeSubtask(overrides: Partial<SubtaskSpec> = {}): SubtaskSpec {
  return {
    title: '查年假',
    brief: '检索制度库给出年假天数',
    acceptance: ['结论有证据'],
    ...overrides,
  };
}

describe('executor-adapter 两观察模式（T2.2/T2.3）', () => {
  let db: DatabaseInstance;
  let deps: ServiceDeps;
  let agentRun: AgentRunView;

  beforeEach(() => {
    setDataRootForTest(mkdtempSync(join(tmpdir(), 'wbfm-exec-adapter-')));
    db = createDatabase(':memory:');
    deps = { db, cipher: createWebCipher() };
    agentRun = createAgentRunRepository(db).create({ assistantId: 'a1', goal: '年假几天' });
  });

  afterEach(() => {
    db.close();
    resetDataRootForTest();
  });

  it('tool 模式：知识子任务经工具通道执行，收敛证据/工具序列/结论并归属 agent_run', async () => {
    const knowledgeTool = mockTool('knowledge_search', 'read', async (_args, ctx) => ({
      ok: true,
      output: '年假 15 天',
      summary: '命中 1 片',
      citations: [
        { documentId: 'd1', documentName: '制度.pdf', ordinal: 1, snippet: '年假 15 天' },
      ],
    }));
    const runtime = makeRuntime({ knowledge_search: knowledgeTool });
    const seenModes: ObserveMode[] = [];
    const usage = { promptTokens: 0, completionTokens: 0 };
    const planner: TaskPlanner = {
      async decide(input: TaskPlannerInput) {
        seenModes.push(input.observeMode ?? 'screen');
        if (input.steps.some((s) => s.kind === 'action')) {
          usage.promptTokens += 20;
          usage.completionTokens += 5;
          return { action: 'done', reason: '已取证', message: '年假 15 天', unfinished: [] };
        }
        usage.promptTokens += 30;
        usage.completionTokens += 8;
        return { action: 'tool', tool: 'knowledge_search', args: { query: '年假' }, reason: '查' };
      },
    };

    const adapter = createExecutorAdapter({
      deps,
      runtime,
      run: agentRun,
      assistantKnowledgeBaseId: 'kb-assistant',
      resolvePlanner: (mode) => {
        expect(mode).toBe('tool');
        return { planner, usage, visionCapable: false };
      },
    });

    const result = await adapter.run(
      { goal: '年假几天', round: 0, subtask: makeSubtask({ toolScopes: ['knowledge'], knowledgeBaseId: 'kb-sub' }) },
      undefined,
    );

    expect(seenModes.every((m) => m === 'tool')).toBe(true);
    expect(result.outcome.summary).toBe('年假 15 天');
    expect(result.outcome.evidence).toEqual([
      expect.objectContaining({ documentId: 'd1', ordinal: 1 }),
    ]);
    expect(result.outcome.toolCalls).toEqual(['knowledge_search']);
    expect(result.usage).toEqual({ promptTokens: 50, completionTokens: 13 });
    expect(result.steps).toBe(1);

    // 子 task_run 归属协作运行
    const taskRuns = db
      .prepare(`SELECT id, agent_run_id AS a FROM task_runs WHERE agent_run_id = ?`)
      .all(agentRun.id) as Array<{ id: string; a: string }>;
    expect(taskRuns).toHaveLength(1);
    const taskSteps = createTaskRunRepository(db).listSteps(taskRuns[0]!.id);
    expect(taskSteps.some((s) => s.reason === '工具模式观察')).toBe(true);
  });

  it('screen 模式：desktop 域展开桌面白名单，视觉门控通过后走截图循环', async () => {
    const runtime = makeRuntime({
      screen_snapshot: mockTool('screen_snapshot', 'read', okObserve),
    });
    const captured: string[][] = [];
    const planner: TaskPlanner = {
      async decide(input) {
        captured.push(input.allowedTools);
        return { action: 'done', reason: '无需操作', message: '屏幕已就绪' };
      },
    };
    const adapter = createExecutorAdapter({
      deps,
      runtime,
      run: agentRun,
      assistantKnowledgeBaseId: null,
      resolvePlanner: (mode) => {
        expect(mode).toBe('screen');
        return { planner, usage: { promptTokens: 1, completionTokens: 1 }, visionCapable: true };
      },
    });

    const result = await adapter.run(
      { goal: 'G', round: 0, subtask: makeSubtask({ title: '桌面操作', toolScopes: ['desktop'] }) },
      undefined,
    );

    expect(result.outcome.summary).toBe('屏幕已就绪');
    expect(captured[0]).toEqual(expect.arrayContaining(['mouse_click', 'keyboard_type', 'screen_snapshot']));
    // 无知识域 → 白名单不含 knowledge_search
    expect(captured[0]).not.toContain('knowledge_search');
  });

  it('screen 模式视觉门控：executor 模型无视觉能力时拒绝执行', async () => {
    const runtime = makeRuntime({ screen_snapshot: mockTool('screen_snapshot', 'read', okObserve) });
    const adapter = createExecutorAdapter({
      deps,
      runtime,
      run: agentRun,
      assistantKnowledgeBaseId: null,
      resolvePlanner: () => ({
        planner: sequencePlanner([{ action: 'done', reason: 'r', message: 'm' }]),
        usage: { promptTokens: 0, completionTokens: 0 },
        visionCapable: false,
      }),
    });
    await expect(
      adapter.run(
        { goal: 'G', round: 0, subtask: makeSubtask({ toolScopes: ['desktop'] }) },
        undefined,
      ),
    ).rejects.toThrow(/视觉/);
  });

  it('fail 终态：unfinished 带边界说明，evidence/toolCalls 仍如实收敛', async () => {
    const runtime = makeRuntime({
      window_list: mockTool('window_list', 'read', () =>
        Promise.resolve({ ok: true, output: '无窗口', summary: 'ok' })),
    });
    const planner: TaskPlanner = {
      async decide() {
        return { action: 'fail', reason: '前提缺失', message: '无法完成' };
      },
    };
    const adapter = createExecutorAdapter({
      deps,
      runtime,
      run: agentRun,
      assistantKnowledgeBaseId: null,
      // 非 desktop 子任务 → tool 模式，不需要视觉
      resolvePlanner: () => ({
        planner,
        usage: { promptTokens: 0, completionTokens: 0 },
        visionCapable: false,
      }),
    });

    const result = await adapter.run(
      { goal: 'G', round: 0, subtask: makeSubtask({ toolScopes: ['mcp:ghost:do'] }) },
      undefined,
    );
    expect(result.outcome.summary).toBe('无法完成');
    expect(result.outcome.unfinished.some((u) => u.includes('失败终态'))).toBe(true);
  });

  it('resolveAllowedTools：knowledge/desktop/mcp 域展开，未知限定名原样透传', () => {
    const depsNoMcp = deps;
    expect(resolveAllowedTools(['knowledge'], depsNoMcp)).toEqual(['knowledge_search']);
    expect(resolveAllowedTools([], depsNoMcp)).toEqual([]);
    expect(resolveAllowedTools(['flow:wf-1', 'custom.tool'], depsNoMcp)).toEqual([
      'flow:wf-1',
      'custom.tool',
    ]);
    // mcp 服务器未连接 → 展开为空（不暴露不存在的工具）
    expect(resolveAllowedTools(['mcp:offline'], depsNoMcp)).toEqual([]);
  });
});
