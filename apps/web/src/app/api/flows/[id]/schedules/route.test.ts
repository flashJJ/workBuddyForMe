import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { FlowGraph } from '@wbfm/shared/schemas';
import { createDatabase, createWorkflowRepository, createWorkflowRunRepository, type DatabaseInstance } from '@wbfm/database';
import { resetDataRootForTest, setDataRootForTest } from '@wbfm/config';
import { createWebCipher } from '@wbfm/core/secrets';
import { __buildContainerForTest, __setContainerForTest } from '@/lib/server/container';
import { DELETE, PATCH } from './[scheduleId]/route';
import { GET, POST } from './route';
import { POST as RUN } from './run/route';

const graph: FlowGraph = {
  nodes: [
    { id: 'start', type: 'start', position: { x: 0, y: 0 }, config: {} },
    { id: 'end', type: 'end', position: { x: 100, y: 0 }, config: {} },
  ],
  edges: [{ id: 'e1', source: 'start', target: 'end' }],
};

describe('多定时管理 API（v4.26）', () => {
  let db: DatabaseInstance;
  let workflowId: string;

  beforeEach(() => {
    setDataRootForTest(mkdtempSync(join(tmpdir(), 'wbfm-schedule-api-')));
    db = createDatabase(':memory:');
    __buildContainerForTest(db, createWebCipher());
    const workflows = createWorkflowRepository(db);
    const wf = workflows.createWorkflow({ name: '定时流' });
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
      new Request(`http://127.0.0.1/api/flows/${workflowId}/schedules`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      }),
      { params: Promise.resolve({ id: workflowId }) },
    );

  it('新增、列表、更新与删除闭环', async () => {
    const created = await post({ name: '早间', cron: '0 9 * * *', timezone: 'Asia/Shanghai' });
    expect(created.status).toBe(200);
    const payload = await created.json();
    const schedule = payload.data.schedule;
    expect(schedule).toMatchObject({ name: '早间', timezone: 'Asia/Shanghai', enabled: true });
    expect(typeof schedule.nextRunAt).toBe('string');

    const listed = await GET(
      new Request(`http://127.0.0.1/api/flows/${workflowId}/schedules`),
      { params: Promise.resolve({ id: workflowId }) },
    );
    expect((await listed.json()).data.schedules).toHaveLength(1);

    const patched = await PATCH(
      new Request(`http://127.0.0.1/api/flows/${workflowId}/schedules/${schedule.id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ timezone: 'America/New_York', enabled: false }),
      }),
      { params: Promise.resolve({ id: workflowId, scheduleId: schedule.id }) },
    );
    expect((await patched.json()).data.schedule).toMatchObject({
      timezone: 'America/New_York',
      enabled: false,
    });

    const removed = await DELETE(
      new Request(`http://127.0.0.1/api/flows/${workflowId}/schedules/${schedule.id}`, {
        method: 'DELETE',
      }),
      { params: Promise.resolve({ id: workflowId, scheduleId: schedule.id }) },
    );
    expect((await removed.json()).data.removed).toBe(true);
  });

  it('非法时区 422、未发布 409、超过 5 条 409', async () => {
    const invalid = await post({ cron: '0 9 * * *', timezone: 'Mars/Olympus' });
    expect(invalid.status).toBe(422);

    const workflows = createWorkflowRepository(db);
    const draft = workflows.createWorkflow({ name: '草稿' });
    workflows.addVersion(draft.id, graph);
    const blocked = await POST(
      new Request(`http://127.0.0.1/api/flows/${draft.id}/schedules`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ cron: '0 9 * * *' }),
      }),
      { params: Promise.resolve({ id: draft.id }) },
    );
    expect(blocked.status).toBe(409);

    for (let index = 0; index < 5; index += 1) {
      await post({ cron: `${index} 9 * * *` });
    }
    const overflow = await post({ cron: '0 10 * * *' });
    expect(overflow.status).toBe(409);
  });

  it('立即运行支持指定条目：在途时返回 busy', async () => {
    const created = await post({ cron: '0 9 * * *' });
    const scheduleId = (await created.json()).data.schedule.id as string;
    // 容器内的运行仓储与路由共享同一库，直接建一条在途运行
    createWorkflowRunRepository(db).createRun({ workflowId, version: 1, trigger: 'manual' });

    const res = await RUN(
      new Request(`http://127.0.0.1/api/flows/${workflowId}/schedules/run`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ scheduleId }),
      }),
      { params: Promise.resolve({ id: workflowId }) },
    );
    expect((await res.json()).data).toMatchObject({ runId: null, reason: 'busy' });
  });
});
