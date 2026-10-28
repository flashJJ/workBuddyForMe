import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mkdtempSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createDatabase, createTaskRunRepository, type DatabaseInstance } from '@wbfm/database';
import { resetDataRootForTest, setDataRootForTest } from '@wbfm/config';
import type { TaskRunView } from '@wbfm/shared/schemas';
import { createWebCipher } from '../secrets/cipher';
import { createTaskGrantRegistry } from './task-grants';
import type { ServiceDeps } from './deps';
import type { Tool, ToolResult } from '../tools/types';
import type { ToolRuntime } from '../tools/tool-runtime';
import type { TaskPlanner, TaskPlanDecision } from '../agent/types';
import type { TaskLoopEvent } from '../agent/control';
import { createTaskRunnerService } from './task-runner-service';

const PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

function mockTool(name: string, permission: Tool['permission'], run: () => Promise<ToolResult>): Tool {
  return { name, description: '', parameters: {}, permission, run };
}
const okObserve = () =>
  Promise.resolve({
    ok: true,
    output: '已截图',
    summary: '截图',
    images: [{ mimeType: 'image/png', dataBase64: PNG_BASE64 }],
  });
function makeRuntime(tools: Record<string, Tool>): ToolRuntime {
  return {
    resolveTool: (name: string) =>
      tools[name] ? { tool: tools[name], source: 'builtin' } : null,
  } as unknown as ToolRuntime;
}
function constantPlanner(decision: TaskPlanDecision): TaskPlanner {
  return { decide: async () => decision };
}

describe('TaskRunnerService（v2.8 服务端持有）', () => {
  let db: DatabaseInstance;
  let run: TaskRunView;

  beforeEach(() => {
    setDataRootForTest(mkdtempSync(join(tmpdir(), 'wbfm-runner-')));
    db = createDatabase();
    const ts = '2026-09-30T00:00:00.000Z';
    db.prepare(
      `INSERT INTO assistants(id, name, created_at, updated_at) VALUES ('a1', 'A', ?, ?)`,
    ).run(ts, ts);
    db.prepare(
      `INSERT INTO conversations(id, assistant_id, title, created_at, updated_at) VALUES ('c1', 'a1', 'T', ?, ?)`,
    ).run(ts, ts);
    run = createTaskRunRepository(db).createRun({
      conversationId: 'c1',
      assistantId: 'a1',
      goal: '测试',
      maxSteps: 5,
    });
  });

  afterEach(() => {
    db.close();
    resetDataRootForTest();
  });

  function makeService(tools: Record<string, Tool>): ReturnType<typeof createTaskRunnerService> {
    const deps: ServiceDeps = { db, cipher: createWebCipher(), taskGrants: createTaskGrantRegistry() };
    return createTaskRunnerService(deps, makeRuntime(tools));
  }

  async function drain(events: AsyncIterableIterator<TaskLoopEvent>): Promise<TaskLoopEvent[]> {
    const list: TaskLoopEvent[] = [];
    for await (const event of events) list.push(event);
    return list;
  }

  const latest = (runId: string) => createTaskRunRepository(db).getRun(runId)!;

  it('start：后台消费，终态后自动移除活跃注册并释放租约', async () => {
    const svc = makeService({ screen_snapshot: mockTool('screen_snapshot', 'read', okObserve) });
    expect(svc.isActive(run.id)).toBe(false);
    const events = svc.start({
      run,
      planner: constantPlanner({ action: 'done', reason: '完成', message: 'done' }),
      allowedTools: [],
      visionCapable: false,
    });
    expect(svc.isActive(run.id)).toBe(true);
    const frame = await drain(events);
    await svc.awaitCompletion(run.id);
    expect(latest(run.id).status).toBe('completed');
    expect(svc.isActive(run.id)).toBe(false);
    expect(frame.some((item) => item.event === 'task')).toBe(true);
  });

  it('重复订阅：第二个观察者不重复启动，且能收到回放', async () => {
    const svc = makeService({ screen_snapshot: mockTool('screen_snapshot', 'read', okObserve) });
    const planner = constantPlanner({ action: 'done', reason: '完成', message: 'done' });
    const first = svc.start({ run, planner, allowedTools: [], visionCapable: false });
    const second = svc.start({ run, planner, allowedTools: [], visionCapable: false });
    const [a, b] = await Promise.all([drain(first), drain(second)]);
    expect(a).toHaveLength(b.length);
    expect(svc.activeRunIds()).toHaveLength(0);
  });

  it('stop：触发 control.stop + abort，以 user_stop 终态退出', async () => {
    const svc = makeService({ screen_snapshot: mockTool('screen_snapshot', 'read', okObserve) });
    const planner: TaskPlanner = {
      decide: async (): Promise<TaskPlanDecision> => {
        await new Promise<void>((resolve) => setTimeout(resolve, 100));
        return { action: 'tool', tool: 'noop', reason: 'x' };
      },
    };
    const events = svc.start({ run, planner, allowedTools: [], visionCapable: false });
    await new Promise((r) => setTimeout(r, 10));
    expect(svc.stop(run.id)).toBe(true);
    await drain(events);
    await svc.awaitCompletion(run.id);
    const final = latest(run.id);
    expect(final.status).toBe('stopped');
    expect(final.stopReason).toBe('user_stop');
  });

  it('pause/resume：状态机联动，resume 后继续推进', async () => {
    const svc = makeService({ screen_snapshot: mockTool('screen_snapshot', 'read', okObserve) });
    const planner = constantPlanner({ action: 'done', reason: '完成', message: 'done' });
    const events = svc.start({ run, planner, allowedTools: [], visionCapable: false });
    expect(svc.pause(run.id)).toBe(true);
    expect(svc.resume(run.id)).toBe(true);
    await drain(events);
    await svc.awaitCompletion(run.id);
    expect(latest(run.id).status).toBe('completed');
  });

  it('stopAll：批量中断多个活跃任务', async () => {
    const svc = makeService({ screen_snapshot: mockTool('screen_snapshot', 'read', okObserve) });
    const planner: TaskPlanner = {
      decide: (_input, signal) =>
        new Promise((_resolve, reject) => {
          signal?.addEventListener('abort', () => reject(new Error('aborted')), { once: true });
        }),
    };
    const run2 = createTaskRunRepository(db).createRun({
      conversationId: 'c1',
      assistantId: 'a1',
      goal: '任务2',
      maxSteps: 5,
    });
    const g1 = svc.start({ run, planner, allowedTools: [], visionCapable: false });
    const g2 = svc.start({ run: run2, planner, allowedTools: [], visionCapable: false });
    await new Promise((r) => setTimeout(r, 10));
    expect(svc.activeRunIds().sort()).toEqual([run.id, run2.id].sort());
    expect(svc.stopAll()).toBe(2);
    await Promise.all([drain(g1), drain(g2)]);
    await Promise.all([svc.awaitCompletion(run.id), svc.awaitCompletion(run2.id)]);
    expect(latest(run.id).status).toBe('stopped');
    expect(latest(run2.id).status).toBe('stopped');
    expect(svc.activeRunIds()).toHaveLength(0);
  });

  it('观察者提前断开不中止运行（关页/断网继续跑）', async () => {
    const svc = makeService({ screen_snapshot: mockTool('screen_snapshot', 'read', okObserve) });
    const planner = constantPlanner({ action: 'done', reason: '完成', message: 'done' });
    const events = svc.start({ run, planner, allowedTools: [], visionCapable: false });
    // 只读一帧就退订（模拟 SSE 断开）
    await events.next();
    await events.return?.();
    await svc.awaitCompletion(run.id);
    expect(latest(run.id).status).toBe('completed');
    expect(svc.isActive(run.id)).toBe(false);
  });

  it('观察者可用 since 续传（跳过已读序号）', async () => {
    const svc = makeService({ screen_snapshot: mockTool('screen_snapshot', 'read', okObserve) });
    const planner = constantPlanner({ action: 'done', reason: '完成', message: 'done' });
    const first = svc.start({ run, planner, allowedTools: [], visionCapable: false });
    const early = await first.next();
    expect(early.done).toBe(false);
    const second = svc.observe(run.id, 2)!;
    const rest = await drain(second);
    await svc.awaitCompletion(run.id);
    // since=2 从第 2 帧开始，不应重复第 1 帧
    expect(rest.length).toBeGreaterThan(0);
    expect(rest[0]).not.toEqual(early.value);
  });

  it('生成器抛错时收敛为 failed，不留下幽灵 running', async () => {
    const svc = makeService({ screen_snapshot: mockTool('screen_snapshot', 'read', okObserve) });
    const planner: TaskPlanner = {
      decide: async () => {
        throw new Error('planner boom');
      },
    };
    await drain(svc.start({ run, planner, allowedTools: [], visionCapable: false }));
    await svc.awaitCompletion(run.id);
    expect(latest(run.id).status).toBe('failed');
  });
});
