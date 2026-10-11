import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createAgentRunRepository,
  createDatabase,
  type DatabaseInstance,
} from '@wbfm/database';
import { resetDataRootForTest, setDataRootForTest } from '@wbfm/config';
import { createWebCipher } from '@wbfm/core/secrets';
import { __buildContainerForTest, __setContainerForTest } from '@/lib/server/container';
import { parseSseChunks } from '@/lib/server/sse-stream';
import { POST as createRun, GET as listRuns } from './runs/route';
import { GET as getRun } from './runs/[id]/route';
import { POST as cancelRun } from './runs/[id]/cancel/route';
import { GET as runEvents } from './runs/[id]/events/route';

const jsonRequest = (body: unknown, init: RequestInit = {}) =>
  new Request('http://127.0.0.1/x', {
    method: 'POST',
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

describe('协作运行 API（v1.4 M1 骨架）', () => {
  let db: DatabaseInstance;
  let tempRoot: string;
  let assistantId: string;
  let conversationId: string;

  beforeEach(() => {
    tempRoot = mkdtempSync(join(tmpdir(), 'wbfm-web-agent-'));
    setDataRootForTest(tempRoot);
    db = createDatabase(':memory:');
    const services = __buildContainerForTest(db, createWebCipher());
    assistantId = services.assistants.list()[0]!.id;
    conversationId = services.conversations.create(assistantId, '协作会话').id;
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    __setContainerForTest(null);
    db.close();
    resetDataRootForTest();
  });

  it('POST 建行 201（默认预算），GET 列表/详情可见且 handoffs 为空', async () => {
    const created = await createRun(jsonRequest({ assistantId, goal: '调研 X 并给出结论' }));
    expect(created.status).toBe(201);
    const run = (await created.json()).data;
    expect(run.status).toBe('running');
    expect(run.budget).toMatchObject({ maxRounds: 3, maxSteps: 20, maxTotalTokens: 80_000 });

    const listResp = await listRuns(new Request('http://127.0.0.1/x'));
    expect((await listResp.json()).data).toHaveLength(1);

    const convList = await listRuns(
      new Request(`http://127.0.0.1/x?conversationId=${conversationId}`),
    );
    expect((await convList.json()).data).toHaveLength(0);

    const detail = await getRun(new Request('http://127.0.0.1/x'), {
      params: Promise.resolve({ id: run.id }),
    });
    const detailData = (await detail.json()).data;
    expect(detailData.run.id).toBe(run.id);
    expect(detailData.handoffs).toEqual([]);
  });

  it('POST 关联会话；助手与会话不匹配返回 422', async () => {
    const ok = await createRun(
      jsonRequest({ assistantId, conversationId, goal: '带会话的协作' }),
    );
    expect(ok.status).toBe(201);
    expect((await ok.json()).data.conversationId).toBe(conversationId);

    const mismatch = await createRun(
      jsonRequest({ assistantId: 'assistant-other', conversationId, goal: '错配' }),
    );
    expect(mismatch.status).toBe(422);
  });

  it('POST 422：空目标 / 预算越界 / 非法 JSON', async () => {
    const emptyGoal = await createRun(jsonRequest({ assistantId, goal: '   ' }));
    expect(emptyGoal.status).toBe(422);

    const badBudget = await createRun(
      jsonRequest({ assistantId, goal: 'G', budget: { maxRounds: 99 } }),
    );
    expect(badBudget.status).toBe(422);

    const badJson = new Request('http://127.0.0.1/x', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{not-json',
    });
    expect((await createRun(badJson)).status).toBe(422);
  });

  it('POST 404：助手/会话不存在', async () => {
    const badAssistant = await createRun(jsonRequest({ assistantId: 'ghost', goal: 'G' }));
    expect(badAssistant.status).toBe(404);
    const badConv = await createRun(
      jsonRequest({ assistantId, conversationId: 'ghost-conv', goal: 'G' }),
    );
    expect(badConv.status).toBe(404);
  });

  it('GET 详情 404；cancel 不存在 404；未订阅 running 直接收敛 cancelled', async () => {
    const missing = await getRun(new Request('http://127.0.0.1/x'), {
      params: Promise.resolve({ id: 'nope' }),
    });
    expect(missing.status).toBe(404);

    const cancelMissing = await cancelRun(new Request('http://127.0.0.1/x', { method: 'POST' }), {
      params: Promise.resolve({ id: 'nope' }),
    });
    expect(cancelMissing.status).toBe(404);

    const repo = createAgentRunRepository(db);
    const run = repo.create({ assistantId, goal: '休眠协作' });
    const cancelDormant = await cancelRun(
      new Request('http://127.0.0.1/x', { method: 'POST' }),
      { params: Promise.resolve({ id: run.id }) },
    );
    expect(cancelDormant.status).toBe(200);
    expect(repo.getById(run.id)!.status).toBe('cancelled');
  });

  it('cancel 终态运行 → 409（状态机非法转移）', async () => {
    const repo = createAgentRunRepository(db);
    const run = repo.create({ assistantId, goal: '已结束协作' });
    repo.finalize(run.id, {
      status: 'done',
      finalOutcome: { summary: '交付', evidence: [], toolCalls: [], unfinished: [] },
    });
    const resp = await cancelRun(new Request('http://127.0.0.1/x', { method: 'POST' }), {
      params: Promise.resolve({ id: run.id }),
    });
    expect(resp.status).toBe(409);
    expect((await resp.json()).error.code).toBe('CONFLICT');
  });

  it('events 不存在 404；未启动运行在模型未配置时 422（M2 生产通道预检验）', async () => {
    const missing = await runEvents(new Request('http://127.0.0.1/x'), {
      params: Promise.resolve({ id: 'nope' }),
    });
    expect(missing.status).toBe(404);

    const repo = createAgentRunRepository(db);
    const run = repo.create({ assistantId, goal: '待启动' });
    const fresh = await runEvents(new Request('http://127.0.0.1/x'), {
      params: Promise.resolve({ id: run.id }),
    });
    expect(fresh.status).toBe(422);
    expect((await fresh.json()).error.code).toBe('VALIDATION_ERROR');
  });

  it('events 终态运行回放：handoffs 帧 + done 后关闭', async () => {
    const repo = createAgentRunRepository(db);
    const run = repo.create({ assistantId, goal: '历史协作' });
    repo.addHandoff({
      runId: run.id,
      roundNo: 0,
      fromRole: 'planner',
      toRole: 'executor',
      payload: { subtask: { title: '子任务', brief: '说明', acceptance: ['标准'] } },
    });
    repo.addTokens(run.id, { promptTokens: 12, completionTokens: 8 });
    repo.finalize(run.id, {
      status: 'done',
      finalOutcome: { summary: '最终交付', evidence: [], toolCalls: [], unfinished: [] },
    });

    const resp = await runEvents(new Request('http://127.0.0.1/x'), {
      params: Promise.resolve({ id: run.id }),
    });
    expect(resp.headers.get('content-type')).toContain('text/event-stream');
    const events = parseSseChunks(await readAll(resp));
    expect(events.map((e) => e.event)).toEqual(['agent_handoff', 'done']);
    const doneData = events[1]!.data as { content: string; usage: { totalTokens: number } };
    expect(doneData.content).toBe('最终交付');
    expect(doneData.usage.totalTokens).toBe(20);
  });
});
