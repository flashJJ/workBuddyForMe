import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createDatabase, createTaskRunRepository, type DatabaseInstance } from '@wbfm/database';
import { resetDataRootForTest, setDataRootForTest } from '@wbfm/config';
import type { TaskRunView, TaskStepView } from '@wbfm/shared/schemas';
import { createWebCipher } from '../secrets/cipher';
import { createPermissionService } from '../services/permission-service';
import { createTaskGrantRegistry } from '../services/task-grants';
import type { ServiceDeps } from '../services/deps';
import type { TaskPlanner } from './types';
import { runTaskLoop } from './task-loop';
import { createTaskLoopControl } from './control';
import { collect, constantPlanner, makeRuntime, mockTool, okObserve, sequencePlanner } from './task-loop.helpers';

describe('任务 Agent 循环（v0.7 M3）', () => {
  let db: DatabaseInstance;
  let run: TaskRunView;

  beforeEach(() => {
    setDataRootForTest(mkdtempSync(join(tmpdir(), 'wbfm-taskloop-')));
    db = createDatabase();
    const ts = '2026-09-30T00:00:00.000Z';
    db.prepare(`INSERT INTO assistants(id, name, created_at, updated_at) VALUES ('a1', 'A', ?, ?)`).run(ts, ts);
    db.prepare(`INSERT INTO conversations(id, assistant_id, title, created_at, updated_at) VALUES ('c1', 'a1', 'T', ?, ?)`).run(ts, ts);
  });

  afterEach(() => {
    db.close();
    resetDataRootForTest();
  });

  function setup(maxSteps = 20): ServiceDeps {
    run = createTaskRunRepository(db).createRun({ conversationId: 'c1', assistantId: 'a1', goal: '测试目标', maxSteps });
    return { db, cipher: createWebCipher() };
  }

  const stepsOf = () => createTaskRunRepository(db).listSteps(run.id);
  const kindsOf = (steps: TaskStepView[]) => steps.map((s) => `${s.kind}:${s.status}`);

  it('完成路径：观察→动作→观察→done，终态 completed 且截图落盘', async () => {
    const deps = setup();
    const runtime = makeRuntime({
      screen_snapshot: mockTool('screen_snapshot', 'read', okObserve),
      window_list: mockTool('window_list', 'read', () => Promise.resolve({ ok: true, output: '1 个窗口', summary: 'ok' })),
    });
    const planner = sequencePlanner([
      { action: 'tool', tool: 'window_list', args: {}, reason: '先看窗口' },
      { action: 'done', reason: '目标达成', message: '已完成' },
    ]);

    const { events, final } = await collect(runTaskLoop({ deps, runtime, planner, run, allowedTools: ['window_list'], visionCapable: true }));

    expect(final.status).toBe('completed');
    expect(final.stopReason).toBe('completed');
    expect(final.stepCount).toBe(1);
    expect(events[0]).toMatchObject({ event: 'task', data: { type: 'run_started' } });
    expect(events.at(-1)).toMatchObject({ event: 'task', data: { type: 'run_finished' } });
    const steps = stepsOf();
    expect(kindsOf(steps)).toEqual(['observe:completed', 'action:completed', 'observe:completed', 'final:completed']);
    expect(steps[0]?.screenshotPath).toBeTruthy();
    expect(steps[3]?.resultJson).toContain('已完成');
  });

  it('步数上限：maxSteps=2 时第三次循环前终止，stop_reason=max_steps', async () => {
    const deps = setup(2);
    const runtime = makeRuntime({
      screen_snapshot: mockTool('screen_snapshot', 'read', okObserve),
      window_list: mockTool('window_list', 'read', () => Promise.resolve({ ok: true, output: 'ok', summary: 'ok' })),
    });
    const planner = constantPlanner({ action: 'tool', tool: 'window_list', reason: 'r' });

    const { final } = await collect(runTaskLoop({ deps, runtime, planner, run, allowedTools: ['window_list'], visionCapable: false }));

    expect(final.status).toBe('stopped');
    expect(final.stopReason).toBe('max_steps');
    expect(final.stepCount).toBe(2);
  });

  it('连续失败上限：动作连续失败 3 次终止，stop_reason=max_failures', async () => {
    const deps = setup();
    const runtime = makeRuntime({
      screen_snapshot: mockTool('screen_snapshot', 'read', okObserve),
      mouse_click: mockTool('mouse_click', 'danger', () => Promise.resolve({ ok: false, output: '失败', summary: '执行失败' })),
    });
    const planner = constantPlanner({ action: 'tool', tool: 'mouse_click', args: { x: 1, y: 2 }, reason: '点' });

    const { final } = await collect(runTaskLoop({ deps, runtime, planner, run, allowedTools: ['mouse_click'], visionCapable: false }));

    expect(final.status).toBe('failed');
    expect(final.stopReason).toBe('max_failures');
    expect(final.failureCount).toBe(3);
  });

  it('成功复位连续失败计数（失败→成功→失败不触顶）', async () => {
    const deps = setup();
    let call = 0;
    const runtime = makeRuntime({
      screen_snapshot: mockTool('screen_snapshot', 'read', okObserve),
      mouse_click: mockTool('mouse_click', 'danger', () => {
        call += 1;
        return Promise.resolve({ ok: call % 2 === 0, output: '', summary: call % 2 === 0 ? 'ok' : 'bad' });
      }),
    });
    const planner = sequencePlanner([
      { action: 'tool', tool: 'mouse_click', reason: '1' },
      { action: 'tool', tool: 'mouse_click', reason: '2' },
      { action: 'tool', tool: 'mouse_click', reason: '3' },
      { action: 'done', reason: '收尾', message: '完成' },
    ]);

    const { final } = await collect(runTaskLoop({ deps, runtime, planner, run, allowedTools: ['mouse_click'], visionCapable: false }));

    expect(final.status).toBe('completed');
    expect(final.failureCount).toBe(2);
  });

  it('熔断联动：目标工具已熔断直接终止，stop_reason=breaker', async () => {
    const deps = { ...setup(), breakers: { isTripped: (n: string) => n === 'mouse_click', recordResult: vi.fn(), reset: vi.fn(), listTripped: () => [] } };
    const runtime = makeRuntime({
      screen_snapshot: mockTool('screen_snapshot', 'read', okObserve),
      mouse_click: mockTool('mouse_click', 'danger', () => Promise.resolve({ ok: true, output: '', summary: '' })),
    });
    const planner = sequencePlanner([{ action: 'tool', tool: 'mouse_click', reason: '点' }]);

    const { final, events } = await collect(runTaskLoop({ deps, runtime, planner, run, allowedTools: ['mouse_click'], visionCapable: false }));

    expect(final.status).toBe('failed');
    expect(final.stopReason).toBe('breaker');
    expect(runtime.resolveTool('mouse_click')?.tool.run).not.toHaveBeenCalled();
    const failedStep = stepsOf().find((s) => s.kind === 'action');
    expect(failedStep?.error).toContain('熔断');
    expect(events.some((e) => e.event === 'task' && e.data.type === 'run_finished')).toBe(true);
  });

  it('急停：AbortSignal 触发后下一轮循环终止，stop_reason=user_stop', async () => {
    const deps = setup();
    const controller = new AbortController();
    const runtime = makeRuntime({
      screen_snapshot: mockTool('screen_snapshot', 'read', okObserve),
      window_list: mockTool('window_list', 'read', () => Promise.resolve({ ok: true, output: '', summary: '' })),
    });
    const planner = constantPlanner({ action: 'tool', tool: 'window_list', reason: 'r' }, (callIndex) => {
      if (callIndex === 1) controller.abort();
    });

    const { final } = await collect(
      runTaskLoop({ deps, runtime, planner, run, allowedTools: ['window_list'], visionCapable: false, signal: controller.signal }),
    );

    expect(final.status).toBe('stopped');
    expect(final.stopReason).toBe('user_stop');
  });

  it('暂停/继续：run_paused 挂起直至 resume，事件序列含 paused→resumed', async () => {
    const deps = setup();
    const control = createTaskLoopControl();
    const runtime = makeRuntime({
      screen_snapshot: mockTool('screen_snapshot', 'read', okObserve),
      window_list: mockTool('window_list', 'read', () => Promise.resolve({ ok: true, output: '', summary: '' })),
    });
    const planner = sequencePlanner([{ action: 'tool', tool: 'window_list', reason: 'r' }]);

    const { events, final } = await collect(
      runTaskLoop({ deps, runtime, planner, run, allowedTools: ['window_list'], visionCapable: false, control }),
      (event) => {
        // 第一步动作完成后暂停；看到 run_paused 事件后恢复
        if (event.event === 'task' && event.data.type === 'step_finished' && event.data.step?.kind === 'action') control.pause();
        if (event.event === 'task' && event.data.type === 'run_paused') control.resume();
      },
    );

    const types = events.filter((e) => e.event === 'task').map((e) => (e as { data: { type: string } }).data.type);
    expect(types).toContain('run_paused');
    expect(types).toContain('run_resumed');
    expect(final.status).toBe('completed');
  });

  it('门控拒绝（无 confirmations）：danger 动作记失败步并继续', async () => {
    const deps = { ...setup(), permissions: createPermissionService({ db, cipher: createWebCipher() }) };
    const runtime = makeRuntime({
      screen_snapshot: mockTool('screen_snapshot', 'read', okObserve),
      app_launch: mockTool('app_launch', 'danger', () => Promise.resolve({ ok: true, output: '', summary: '' })),
    });
    const planner = sequencePlanner([{ action: 'tool', tool: 'app_launch', args: { target: 'notepad' }, reason: '启动' }]);

    const { events, final } = await collect(runTaskLoop({ deps, runtime, planner, run, allowedTools: ['app_launch'], visionCapable: false }));

    expect(events.some((e) => e.event === 'tool_confirmation_required')).toBe(true);
    expect(runtime.resolveTool('app_launch')?.tool.run).not.toHaveBeenCalled();
    const denied = stepsOf().find((s) => s.kind === 'action');
    expect(denied?.status).toBe('failed');
    expect(denied?.error).toBe('用户拒绝授权');
    expect(final.status).toBe('completed'); // 第二个决策为默认 done
  });

  it('任务级批量授权：taskGrants 命中免确认直接执行', async () => {
    const base = setup();
    const taskGrants = createTaskGrantRegistry();
    const deps: ServiceDeps = {
      ...base,
      permissions: createPermissionService({ db, cipher: createWebCipher() }),
      taskGrants,
    };
    const runtime = makeRuntime({
      screen_snapshot: mockTool('screen_snapshot', 'read', okObserve),
      app_launch: mockTool('app_launch', 'danger', () => Promise.resolve({ ok: true, output: '已启动', summary: 'ok' })),
    });
    taskGrants.grant('app_launch', run.id);
    const planner = sequencePlanner([{ action: 'tool', tool: 'app_launch', args: { target: 'notepad' }, reason: '启动' }]);

    const { events, final } = await collect(runTaskLoop({ deps, runtime, planner, run, allowedTools: ['app_launch'], visionCapable: false }));

    expect(events.some((e) => e.event === 'tool_confirmation_required')).toBe(false);
    expect(runtime.resolveTool('app_launch')?.tool.run).toHaveBeenCalledTimes(1);
    expect(final.status).toBe('completed');
    expect(taskGrants.isGranted('app_launch', run.id)).toBe(false); // 终态清空任务授权
  });

  it('白名单外工具：记失败步并继续（模型可纠错）', async () => {
    const deps = setup();
    const runtime = makeRuntime({
      screen_snapshot: mockTool('screen_snapshot', 'read', okObserve),
      keyboard_type: mockTool('keyboard_type', 'danger', () => Promise.resolve({ ok: true, output: '', summary: '' })),
    });
    const planner = sequencePlanner([{ action: 'tool', tool: 'keyboard_type', reason: '越权' }]);

    const { final } = await collect(runTaskLoop({ deps, runtime, planner, run, allowedTools: ['window_list'], visionCapable: false }));

    const rejected = stepsOf().find((s) => s.kind === 'action');
    expect(rejected?.status).toBe('failed');
    expect(rejected?.error).toContain('白名单');
    expect(runtime.resolveTool('keyboard_type')?.tool.run).not.toHaveBeenCalled();
    expect(final.status).toBe('completed');
  });

  it('决策解析失败：记失败步并计入连续失败上限', async () => {
    const deps = setup();
    const runtime = makeRuntime({ screen_snapshot: mockTool('screen_snapshot', 'read', okObserve) });
    const planner: TaskPlanner = { decide: async () => Promise.reject(new Error('输出中未找到 JSON 对象')) };

    const { final } = await collect(runTaskLoop({ deps, runtime, planner, run, allowedTools: [], visionCapable: false }));

    expect(final.status).toBe('failed');
    expect(final.stopReason).toBe('max_failures');
    expect(final.failureCount).toBe(3);
    expect(stepsOf().filter((s) => s.error.includes('决策失败'))).toHaveLength(3);
  });
});
