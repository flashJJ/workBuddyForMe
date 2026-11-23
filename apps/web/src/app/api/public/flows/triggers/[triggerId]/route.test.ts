import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { FlowGraph } from '@wbfm/shared/schemas';
import {
  createDatabase,
  createWorkflowRepository,
  createWorkflowRunRepository,
  type DatabaseInstance,
} from '@wbfm/database';
import { resetDataRootForTest, setDataRootForTest } from '@wbfm/config';
import { createWebCipher } from '@wbfm/core/secrets';
import { __buildContainerForTest, __setContainerForTest, getServices } from '@/lib/server/container';
import { POST as fireWebhook } from './route';

const graph: FlowGraph = {
  nodes: [
    { id: 'start', type: 'start', position: { x: 0, y: 0 }, config: {} },
    { id: 'end', type: 'end', position: { x: 100, y: 0 }, config: { output: 'OK' } },
  ],
  edges: [{ id: 'e1', source: 'start', target: 'end' }],
};

/** 等待队列 tick 收尾，避免关库后残留 setImmediate */
const settle = () => new Promise((resolve) => setTimeout(resolve, 10));

describe('Webhook 触发公开路由（v4.25）', () => {
  let db: DatabaseInstance;
  let triggerId: string;
  let secret: string;
  let workflowId: string;

  beforeEach(() => {
    const tempRoot = mkdtempSync(join(tmpdir(), 'wbfm-trigger-'));
    setDataRootForTest(tempRoot);
    db = createDatabase(':memory:');
    const services = __buildContainerForTest(db, createWebCipher());
    const workflows = createWorkflowRepository(db);
    const wf = workflows.createWorkflow({ name: '事件流' });
    workflows.addVersion(wf.id, graph);
    workflows.publishVersion(wf.id);
    workflowId = wf.id;
    const created = services.flowTriggers.service.create(wf.id, { kind: 'webhook' });
    triggerId = created.trigger.id;
    secret = created.secret!;
  });

  afterEach(() => {
    __setContainerForTest(null);
    db.close();
    resetDataRootForTest();
  });

  const request = (body = '{}', headers: Record<string, string> = {}, id = triggerId, host?: string) =>
    new Request(`http://${host ?? '127.0.0.1:3000'}/api/public/flows/triggers/${id}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...headers },
      body,
    });

  const call = (req: Request, id = triggerId) =>
    fireWebhook(req, { params: Promise.resolve({ triggerId: id }) });

  it('合法请求：202 + runId，运行 trigger=webhook 且正常收尾', async () => {
    const res = await call(request(JSON.stringify({ topic: '周报' }), {
      authorization: `Bearer ${secret}`,
    }));
    expect(res.status).toBe(202);
    const payload = await res.json();
    const runId = payload.data.runId as string;
    expect(runId).toBeTruthy();

    const finished = await getServices().flowRunner.waitForTerminal(runId, 5_000);
    expect(finished.timedOut).toBe(false);
    expect(finished.run?.status).toBe('succeeded');
    expect(createWorkflowRunRepository(db).getRun(runId)?.trigger).toBe('webhook');
    expect(createWorkflowRunRepository(db).getRun(runId)?.workflowId).toBe(workflowId);
    await settle();
  });

  it('鉴权与 Host：无 Secret 401、错 Secret 401、未知触发器 404、非环回 403', async () => {
    expect((await call(request('{}'))).status).toBe(401);
    expect(
      (await call(request('{}', { authorization: 'Bearer wft_wrong' }))).status,
    ).toBe(401);
    expect(
      (await call(request('{}', { authorization: `Bearer ${secret}` }, 'missing'), 'missing')).status,
    ).toBe(404);
    const evil = new Request('http://evil.example/api/public/flows/triggers/x', {
      method: 'POST',
      headers: { authorization: `Bearer ${secret}` },
      body: '{}',
    });
    expect((await call(evil)).status).toBe(403);
  });

  it('幂等键：重复请求 200 duplicate，不再创建运行', async () => {
    const first = await call(
      request('{}', { authorization: `Bearer ${secret}`, 'idempotency-key': 'k1' }),
    );
    expect(first.status).toBe(202);
    const runId = (await first.json()).data.runId as string;
    await getServices().flowRunner.waitForTerminal(runId, 5_000);
    await settle();

    const second = await call(
      request('{}', { authorization: `Bearer ${secret}`, 'idempotency-key': 'k1' }),
    );
    expect(second.status).toBe(200);
    expect((await second.json()).data.duplicate).toBe(true);
  });

  it('在途运行：409 flow_busy', async () => {
    createWorkflowRunRepository(db).createRun({
      workflowId,
      version: 1,
      trigger: 'manual',
    });
    const res = await call(request('{}', { authorization: `Bearer ${secret}` }));
    expect(res.status).toBe(409);
    expect((await res.json()).error.code).toBe('flow_busy');
  });

  it('请求体校验：非 JSON 415、非法 JSON 422、非对象 422、超大 413', async () => {
    const auth = { authorization: `Bearer ${secret}` };
    expect((await call(request('{}', { ...auth, 'content-type': 'text/plain' }))).status).toBe(415);
    expect((await call(request('{oops', auth))).status).toBe(422);
    expect((await call(request('[1,2]', auth))).status).toBe(422);
    const huge = JSON.stringify({ text: 'x'.repeat(256 * 1024 + 10) });
    expect((await call(request(huge, auth))).status).toBe(413);
  });
});
