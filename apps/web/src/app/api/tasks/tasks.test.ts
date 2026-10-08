import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createDatabase,
  createTaskRunRepository,
  type DatabaseInstance,
} from '@wbfm/database';
import { resetDataRootForTest, setDataRootForTest } from '@wbfm/config';
import { createWebCipher } from '@wbfm/core/secrets';
import { __buildContainerForTest, __setContainerForTest } from '@/lib/server/container';
import { parseSseChunks } from '@/lib/server/sse-stream';
import { POST as createTask } from './route';
import { GET as getTask } from './[id]/route';
import { GET as listTasks } from './route';
import { GET as streamEvents } from './[id]/events/route';
import { POST as controlTask } from './[id]/control/route';
import { POST as stopAll } from './stop-all/route';

const jsonRequest = (body: unknown, method = 'POST', init: RequestInit = {}) =>
  new Request('http://127.0.0.1/x', {
    method,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
    ...init,
  });

async function readAll(response: Response): Promise<string> {
  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  let raw = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    raw += decoder.decode(value, { stream: true });
  }
  return raw + decoder.decode();
}

describe('任务 API（v0.7 M3-4b）', () => {
  let db: DatabaseInstance;
  let tempRoot: string;
  let builtinAssistantId: string;
  let conversationId: string;

  beforeEach(() => {
    tempRoot = mkdtempSync(join(tmpdir(), 'wbfm-web-tasks-'));
    setDataRootForTest(tempRoot);
    db = createDatabase(':memory:');
    const services = __buildContainerForTest(db, createWebCipher());
    builtinAssistantId = services.assistants.list()[0]!.id;
    // 创建一个会话供任务挂载
    const conv = services.conversations.create(builtinAssistantId, '任务会话');
    conversationId = conv.id;
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    __setContainerForTest(null);
    db.close();
    resetDataRootForTest();
  });

  it('POST /api/tasks 创建 queued 运行，GET 列表/详情可见，control 在非活跃时 404', async () => {
    const created = await createTask(
      jsonRequest({ conversationId, goal: '打开记事本写一段话' }),
    );
    expect(created.status).toBe(201);
    const run = (await created.json()).data;
    expect(run.status).toBe('queued');
    expect(run.goal).toBe('打开记事本写一段话');
    expect(run.maxSteps).toBe(20); // 默认 TASK_MAX_STEPS

    // GET /api/tasks?conversationId=xxx
    const listResponse = await listTasks(
      new Request(`http://127.0.0.1/x?conversationId=${conversationId}`),
    );
    const list = (await listResponse.json()).data;
    expect(list).toHaveLength(1);
    expect(list[0].id).toBe(run.id);

    // GET /api/tasks/:id → run + steps（空数组）
    const detail = await getTask(new Request('http://127.0.0.1/x'), {
      params: Promise.resolve({ id: run.id }),
    });
    const detailData = (await detail.json()).data;
    expect(detailData.run.id).toBe(run.id);
    expect(detailData.steps).toEqual([]);

    // GET /api/tasks/:id 404
    const notFound = await getTask(new Request('http://127.0.0.1/x'), {
      params: Promise.resolve({ id: 'non-existent' }),
    });
    expect(notFound.status).toBe(404);

    // POST /api/tasks/:id/control { action: stop } → 404（非活跃）
    const ctrl = await controlTask(jsonRequest({ action: 'stop' }), {
      params: Promise.resolve({ id: run.id }),
    });
    expect(ctrl.status).toBe(404);

    // POST /api/tasks/stop-all → stopped=0
    const stopResp = await stopAll(new Request('http://127.0.0.1/x', { method: 'POST' }));
    const stopData = (await stopResp.json()).data;
    expect(stopData.stopped).toBe(0);
  });

  it('POST /api/tasks 对不存在会话返回 404', async () => {
    const response = await createTask(
      jsonRequest({ conversationId: 'no-such-conv', goal: 'x' }),
    );
    expect(response.status).toBe(404);
  });

  it('GET /api/tasks/:id/events 终态运行回放步骤 + run_finished', async () => {
    // 直接建一个终态运行 + 一条历史步骤
    const repo = createTaskRunRepository(db);
    const run = repo.createRun({
      conversationId,
      assistantId: builtinAssistantId,
      goal: '历史任务',
      maxSteps: 5,
    });
    const step = repo.addStep({
      runId: run.id,
      stepIndex: 1,
      kind: 'observe',
      reason: '观察屏幕',
    });
    repo.finishStep(step.id, {
      status: 'completed',
      resultJson: '{"summary":"已截图"}',
      durationMs: 100,
    });
    repo.updateRunStatus(run.id, 'completed', 'completed');

    const response = await streamEvents(new Request('http://127.0.0.1/x'), {
      params: Promise.resolve({ id: run.id }),
    });
    expect(response.headers.get('content-type')).toContain('text/event-stream');
    const events = parseSseChunks(await readAll(response));
    expect(events.map((e) => e.event)).toEqual(['task', 'task']);
    expect((events[0]!.data as { type: string }).type).toBe('step_finished');
    expect((events[1]!.data as { type: string }).type).toBe('run_finished');
  });

  it('GET /api/tasks/:id/events 不存在运行返回 404', async () => {
    const response = await streamEvents(new Request('http://127.0.0.1/x'), {
      params: Promise.resolve({ id: 'no-such-run' }),
    });
    expect(response.status).toBe(404);
  });

  it('GET /api/tasks/:id/events 已活跃返回 409', async () => {
    const repo = createTaskRunRepository(db);
    const run = repo.createRun({
      conversationId,
      assistantId: builtinAssistantId,
      goal: '占位',
      maxSteps: 3,
    });
    // 直接在 taskRunner 注册表里挂一个空活跃项（绕过 start 避免真实循环）
    const services = __buildContainerForTest(db, createWebCipher());
    // 通过 start 注入一个永挂的 planner，让 isActive 返回 true
    const forever = new Promise(() => {});
    services.taskRunner.start({
      run,
      planner: { decide: async () => forever as never },
      allowedTools: [],
      visionCapable: false,
    });
    const response = await streamEvents(new Request('http://127.0.0.1/x'), {
      params: Promise.resolve({ id: run.id }),
    });
    expect(response.status).toBe(409);
    services.taskRunner.stop(run.id);
  });
});
