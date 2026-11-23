import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  createDatabase,
  createWorkflowRepository,
  createWorkflowRunRepository,
  type DatabaseInstance,
} from '@wbfm/database';
import { resetDataRootForTest, setDataRootForTest } from '@wbfm/config';
import { createWebCipher } from '@wbfm/core/secrets';
import { __buildContainerForTest, __setContainerForTest } from '@/lib/server/container';
import { POST } from './route';

const graph = {
  nodes: [
    { id: 'start', type: 'start', position: { x: 0, y: 0 } },
    { id: 'end', type: 'end', position: { x: 1, y: 1 } },
  ],
  edges: [{ id: 'e1', source: 'start', target: 'end' }],
};

describe('POST /api/flow-runs/replay-batch（v5.0）', () => {
  let db: DatabaseInstance;

  beforeEach(() => {
    setDataRootForTest(mkdtempSync(join(tmpdir(), 'wbfm-web-replay-')));
    db = createDatabase(':memory:');
    __buildContainerForTest(db, createWebCipher());
  });

  afterEach(() => {
    __setContainerForTest(null);
    db.close();
    resetDataRootForTest();
  });

  it('批量重放失败运行，返回逐条结果与汇总', async () => {
    const workflows = createWorkflowRepository(db);
    const runs = createWorkflowRunRepository(db);
    const wf = workflows.createWorkflow({ name: '批量' });
    const run = runs.createRun({
      workflowId: wf.id,
      version: 1,
      trigger: 'schedule',
      graphSnapshotJson: JSON.stringify(graph),
    });
    runs.finishRun(run.id, 'failed', { error: { code: 'network', message: 'ECONNRESET' } });

    const response = await POST(
      new Request('http://x/api/flow-runs/replay-batch', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ runIds: [run.id], nodeMode: 'whole' }),
      }),
    );
    expect(response.status).toBe(200);
    const data = (await response.json()).data;
    expect(data.summary).toMatchObject({ requested: 1, started: 1, failed: 0 });
    expect(data.results[0]).toMatchObject({ runId: run.id, ok: true });
  });

  it('超过 20 条返回 422', async () => {
    const response = await POST(
      new Request('http://x/api/flow-runs/replay-batch', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ runIds: Array.from({ length: 21 }, (_, i) => `r${i}`) }),
      }),
    );
    expect(response.status).toBe(422);
  });
});
