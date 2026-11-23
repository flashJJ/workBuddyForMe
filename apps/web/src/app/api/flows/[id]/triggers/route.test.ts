import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { FlowGraph } from '@wbfm/shared/schemas';
import { createDatabase, createWorkflowRepository, type DatabaseInstance } from '@wbfm/database';
import { resetDataRootForTest, setDataRootForTest } from '@wbfm/config';
import { createWebCipher } from '@wbfm/core/secrets';
import { __buildContainerForTest, __setContainerForTest } from '@/lib/server/container';
import { DELETE, PATCH } from './[triggerId]/route';
import { GET, POST } from './route';

const graph: FlowGraph = {
  nodes: [
    { id: 'start', type: 'start', position: { x: 0, y: 0 }, config: {} },
    { id: 'end', type: 'end', position: { x: 100, y: 0 }, config: {} },
  ],
  edges: [{ id: 'e1', source: 'start', target: 'end' }],
};

describe('触发器管理 API（v4.25）', () => {
  let db: DatabaseInstance;
  let workflowId: string;

  beforeEach(() => {
    setDataRootForTest(mkdtempSync(join(tmpdir(), 'wbfm-trigger-api-')));
    db = createDatabase(':memory:');
    __buildContainerForTest(db, createWebCipher());
    const workflows = createWorkflowRepository(db);
    const wf = workflows.createWorkflow({ name: '事件流' });
    workflows.addVersion(wf.id, graph);
    workflows.publishVersion(wf.id);
    workflowId = wf.id;
  });

  afterEach(() => {
    __setContainerForTest(null);
    db.close();
    resetDataRootForTest();
  });

  const post = (body: unknown) =>
    POST(
      new Request(`http://127.0.0.1/api/flows/${workflowId}/triggers`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      }),
      { params: Promise.resolve({ id: workflowId }) },
    );

  it('创建 Webhook 返回一次性 Secret，列表/禁用/删除闭环', async () => {
    const created = await post({ kind: 'webhook', name: '回调' });
    expect(created.status).toBe(200);
    const payload = await created.json();
    expect(payload.data.secret).toMatch(/^wft_/);
    expect(payload.data.trigger.webhookPath).toContain(payload.data.trigger.id);
    const triggerId = payload.data.trigger.id as string;

    const listed = await GET(
      new Request(`http://127.0.0.1/api/flows/${workflowId}/triggers`),
      { params: Promise.resolve({ id: workflowId }) },
    );
    expect((await listed.json()).data.triggers).toHaveLength(1);

    const patched = await PATCH(
      new Request(`http://127.0.0.1/api/flows/${workflowId}/triggers/${triggerId}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ enabled: false }),
      }),
      { params: Promise.resolve({ id: workflowId, triggerId }) },
    );
    expect((await patched.json()).data.trigger.enabled).toBe(false);

    const removed = await DELETE(
      new Request(`http://127.0.0.1/api/flows/${workflowId}/triggers/${triggerId}`, {
        method: 'DELETE',
      }),
      { params: Promise.resolve({ id: workflowId, triggerId }) },
    );
    expect((await removed.json()).data.removed).toBe(true);
  });

  it('未发布流程拒绝创建（409）', async () => {
    const workflows = createWorkflowRepository(db);
    const draft = workflows.createWorkflow({ name: '草稿' });
    workflows.addVersion(draft.id, graph);
    const res = await POST(
      new Request(`http://127.0.0.1/api/flows/${draft.id}/triggers`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ kind: 'webhook' }),
      }),
      { params: Promise.resolve({ id: draft.id }) },
    );
    expect(res.status).toBe(409);
  });
});
