import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mkdtempSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createDatabase, createTaskRunRepository, type DatabaseInstance } from '@wbfm/database';
import { resetDataRootForTest, setDataRootForTest } from '@wbfm/config';
import type { TaskRunView } from '@wbfm/shared/schemas';
import { createWebCipher } from '../secrets/cipher';
import { createTaskGrantRegistry } from './task-grants';
import type { ServiceDeps } from './deps';
import type { Tool, ToolResult } from '../tools/types';
import type { ToolRuntime } from '../tools/tool-runtime';
import type { TaskPlanner, TaskPlanDecision } from '../agent/types';
import { createTaskRunnerService } from './task-runner-service';

const PNG_BASE64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
function mockTool(name: string, permission: Tool['permission'], run: () => Promise<ToolResult>): Tool {
  return { name, description: '', parameters: {}, permission, run };
}
const okObserve = () =>
  Promise.resolve({ ok: true, output: '已截图', summary: '截图', images: [{ mimeType: 'image/png', dataBase64: PNG_BASE64 }] });
function makeRuntime(tools: Record<string, Tool>): ToolRuntime {
  return { resolveTool: (name: string) => (tools[name] ? { tool: tools[name], source: 'builtin' } : null) } as unknown as ToolRuntime;
}
function constantPlanner(decision: TaskPlanDecision): TaskPlanner {
  return { decide: async () => decision };
}

describe('TaskRunnerService（v0.7 M3-4）', () => {
  let db: DatabaseInstance;
  let run: TaskRunView;

  beforeEach(() => {
    setDataRootForTest(mkdtempSync(join(tmpdir(), 'wbfm-runner-')));
    db = createDatabase();
    const ts = '2026-09-30T00:00:00.000Z';
    db.prepare(`INSERT INTO assistants(id, name, created_at, updated_at) VALUES ('a1', 'A', ?, ?)`).run(ts, ts);
    db.prepare(`INSERT INTO conversations(id, assistant_id, title, created_at, updated_at) VALUES ('c1', 'a1', 'T', ?, ?)`).run(ts, ts);
    run = createTaskRunRepository(db).createRun({ conversationId: 'c1', assistantId: 'a1', goal: '测试', maxSteps: 5 });
  });

  afterEach(() => {
    db.close();
    resetDataRootForTest();
  });

  function makeService(tools: Record<string, Tool>): ReturnType<typeof createTaskRunnerService> {
    const deps: ServiceDeps = { db, cipher: createWebCipher(), taskGrants: createTaskGrantRegistry() };
    return createTaskRunnerService(deps, makeRuntime(tools));
  }

  async function collectAll(gen: AsyncGenerator<unknown, TaskRunView>): Promise<TaskRunView> {
    for (;;) {
      const step = await gen.next();
      if (step.done) return step.value;
    }
  }

  it('start：循环完成后自动从注册表移除', async () => {
    const svc = makeService({ screen_snapshot: mockTool('screen_snapshot', 'read', okObserve) });
    expect(svc.isActive(run.id)).toBe(false);
    const gen = svc.start({
      run,
      planner: constantPlanner({ action: 'done', reason: '完成', message: 'done' }),
      allowedTools: [],
      visionCapable: false,
    });
    expect(svc.isActive(run.id)).toBe(true);
    const final = await collectAll(gen);
    expect(final.status).toBe('completed');
    expect(svc.isActive(run.id)).toBe(false);
  });

  it('stop：触发 control.stop + abort，循环以 user_stop 终态退出', async () => {
    const svc = makeService({ screen_snapshot: mockTool('screen_snapshot', 'read', okObserve) });
    const decide = vi.fn(async (): Promise<TaskPlanDecision> => {
      // 模拟长决策：等到外部 stop 才返回
      await new Promise<void>((resolve) => setTimeout(resolve, 100));
      return { action: 'tool', tool: 'noop', reason: 'x' };
    });
    const planner: TaskPlanner = { decide };
    const gen = svc.start({ run, planner, allowedTools: [], visionCapable: false });
    // 让循环进入决策等待
    await new Promise((r) => setTimeout(r, 10));
    expect(svc.stop(run.id)).toBe(true);
    const final = await collectAll(gen);
    expect(final.status).toBe('stopped');
    expect(final.stopReason).toBe('user_stop');
  });

  it('pause/resume：状态机联动，resume 后继续推进', async () => {
    const svc = makeService({ screen_snapshot: mockTool('screen_snapshot', 'read', okObserve) });
    const decide = vi.fn(async (): Promise<TaskPlanDecision> => ({ action: 'done', reason: '完成', message: 'done' }));
    const planner: TaskPlanner = { decide };
    const gen = svc.start({ run, planner, allowedTools: [], visionCapable: false });
    // 暂停后立即恢复（循环会在 waitIfPaused 处挂起）
    expect(svc.pause(run.id)).toBe(true);
    expect(svc.resume(run.id)).toBe(true);
    const final = await collectAll(gen);
    expect(final.status).toBe('completed');
  });

  it('stopAll：批量中断多个活跃任务', async () => {
    const svc = makeService({ screen_snapshot: mockTool('screen_snapshot', 'read', okObserve) });
    const decide = vi.fn(async (): Promise<TaskPlanDecision> => new Promise(() => {}));
    const planner: TaskPlanner = { decide };
    const run2 = createTaskRunRepository(db).createRun({ conversationId: 'c1', assistantId: 'a1', goal: '任务2', maxSteps: 5 });
    const gen1 = svc.start({ run, planner, allowedTools: [], visionCapable: false });
    const gen2 = svc.start({ run: run2, planner, allowedTools: [], visionCapable: false });
    await new Promise((r) => setTimeout(r, 10));
    expect(svc.activeRunIds().sort()).toEqual([run.id, run2.id].sort());
    expect(svc.stopAll()).toBe(2);
    const [f1, f2] = await Promise.all([collectAll(gen1), collectAll(gen2)]);
    expect(f1.status).toBe('stopped');
    expect(f2.status).toBe('stopped');
    expect(svc.activeRunIds()).toHaveLength(0);
  });

  it('clientSignal 联动：客户端断线触发 abort，循环以 user_stop 退出', async () => {
    const svc = makeService({ screen_snapshot: mockTool('screen_snapshot', 'read', okObserve) });
    const clientAbort = new AbortController();
    const decide = vi.fn(async (): Promise<TaskPlanDecision> => new Promise(() => {}));
    const planner: TaskPlanner = { decide };
    const gen = svc.start({ run, planner, allowedTools: [], visionCapable: false, clientSignal: clientAbort.signal });
    await new Promise((r) => setTimeout(r, 10));
    clientAbort.abort();
    const final = await collectAll(gen);
    expect(final.status).toBe('stopped');
    expect(final.stopReason).toBe('user_stop');
  });
});
