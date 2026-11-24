import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { resetDataRootForTest, setDataRootForTest } from '@wbfm/config';
import {
  createDatabase,
  createWorkflowRepository,
  createWorkflowRunRepository,
  type DatabaseInstance,
} from '@wbfm/database';
import { createWebCipher } from '@wbfm/core/secrets';
import {
  __buildContainerForTest,
  __setContainerForTest,
  type ServiceContainer,
} from '@/lib/server/container';
import { GET } from './route';

describe('v5.1 运行快照 API', () => {
  let db: DatabaseInstance;
  let root: string;
  let services: ServiceContainer;
  let runId: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'wbfm-snapshots-route-'));
    setDataRootForTest(root);
    db = createDatabase(':memory:');
    services = __buildContainerForTest(db, createWebCipher());
    const workflows = createWorkflowRepository(db);
    const runs = createWorkflowRunRepository(db);
    const wf = workflows.createWorkflow({ name: '快照路由' });
    runId = runs.createRun({ workflowId: wf.id, version: 1 }).id;
  });

  afterEach(() => {
    __setContainerForTest(null);
    db.close();
    resetDataRootForTest();
    rmSync(root, { recursive: true, force: true });
  });

  const call = (id: string) =>
    GET(new Request(`http://x/api/flow-runs/${id}/snapshots`), {
      params: Promise.resolve({ id }),
    });

  it('返回快照清单与占用', async () => {
    const file = join(services.fileSafety.guard.defaultRoot, 'a.txt');
    writeFileSync(file, 'content');
    services.fileSafety.snapshotService.beforeWrite({
      runId,
      workflowId: 'wf',
      toolName: 'write_file',
      path: file,
    });

    const response = await call(runId);
    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      data: { snapshots: Array<{ path: string }>; usage: { count: number } };
    };
    expect(body.data.snapshots.map((item) => item.path)).toEqual([file]);
    expect(body.data.usage.count).toBe(1);
  });

  it('运行不存在返回 404', async () => {
    const response = await call('missing');
    expect(response.status).toBe(404);
  });
});
