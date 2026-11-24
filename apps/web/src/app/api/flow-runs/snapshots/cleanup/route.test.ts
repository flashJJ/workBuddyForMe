import { mkdtempSync, rmSync } from 'node:fs';
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
import { GET, POST } from './route';

describe('v5.1 快照清理 API', () => {
  let db: DatabaseInstance;
  let root: string;
  let services: ServiceContainer;
  let runId: string;
  let workflowId: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'wbfm-cleanup-route-'));
    setDataRootForTest(root);
    db = createDatabase(':memory:');
    services = __buildContainerForTest(db, createWebCipher());
    const workflows = createWorkflowRepository(db);
    const runs = createWorkflowRunRepository(db);
    const wf = workflows.createWorkflow({ name: '清理路由' });
    workflowId = wf.id;
    runId = runs.createRun({ workflowId: wf.id, version: 1 }).id;
  });

  afterEach(() => {
    __setContainerForTest(null);
    db.close();
    resetDataRootForTest();
    rmSync(root, { recursive: true, force: true });
  });

  const post = (body: unknown) =>
    POST(
      new Request('http://x/api/flow-runs/snapshots/cleanup', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      }),
    );

  it('GET 返回占用；dry-run 不删除，正式清理后归零', async () => {
    services.fileSafety.snapshots.createSnapshot({
      runId,
      workflowId,
      toolName: 'write_file',
      action: 'write_new',
      path: join(services.fileSafety.guard.defaultRoot, 'old.txt'),
      existedBefore: false,
      byteSize: 10,
      createdAt: '2026-10-01T00:00:00.000Z',
    });

    const usage = await GET(new Request('http://x/api/flow-runs/snapshots/cleanup'));
    const usageBody = (await usage.json()) as { data: { count: number } };
    expect(usageBody.data.count).toBe(1);

    const dry = await post({ dryRun: true });
    expect((await dry.json()).data).toMatchObject({ removed: 1, dryRun: true });

    const real = await post({ dryRun: false });
    expect((await real.json()).data).toMatchObject({ removed: 1, dryRun: false });
    const after = await GET(new Request('http://x/api/flow-runs/snapshots/cleanup'));
    expect(((await after.json()) as { data: { count: number } }).data.count).toBe(0);
  });
});
