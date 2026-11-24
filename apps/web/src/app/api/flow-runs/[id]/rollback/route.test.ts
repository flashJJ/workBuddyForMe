import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
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
import { sha256OfBuffer } from '@wbfm/core/workspace';
import {
  __buildContainerForTest,
  __setContainerForTest,
  type ServiceContainer,
} from '@/lib/server/container';
import { POST } from './route';

describe('v5.1 运行回滚 API', () => {
  let db: DatabaseInstance;
  let root: string;
  let services: ServiceContainer;
  let runId: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'wbfm-rollback-route-'));
    setDataRootForTest(root);
    db = createDatabase(':memory:');
    services = __buildContainerForTest(db, createWebCipher());
    const workflows = createWorkflowRepository(db);
    const runs = createWorkflowRunRepository(db);
    const wf = workflows.createWorkflow({ name: '回滚路由' });
    runId = runs.createRun({ workflowId: wf.id, version: 1 }).id;
  });

  afterEach(() => {
    __setContainerForTest(null);
    db.close();
    resetDataRootForTest();
    rmSync(root, { recursive: true, force: true });
  });

  const post = (id: string, body: unknown) =>
    POST(
      new Request(`http://x/api/flow-runs/${id}/rollback`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      }),
      { params: Promise.resolve({ id }) },
    );

  it('dry-run 返回计划且不落盘；非 dry-run 缺少 force 时冲突返回 409', async () => {
    const file = join(services.fileSafety.guard.defaultRoot, 'created.txt');
    const snapshot = services.fileSafety.snapshotService.beforeWrite({
      runId,
      workflowId: 'wf',
      toolName: 'write_file',
      path: file,
    })!;
    writeFileSync(file, 'created');
    services.fileSafety.snapshotService.afterWrite({
      snapshotId: snapshot.id,
      writtenSha256: sha256OfBuffer(Buffer.from('created')),
    });
    writeFileSync(file, 'modified');

    const preview = await post(runId, { dryRun: true });
    expect(preview.status).toBe(200);
    const previewBody = (await preview.json()) as { data: { totals: { conflict: number } } };
    expect(previewBody.data.totals.conflict).toBe(1);
    expect(existsSync(file)).toBe(true);

    const conflict = await post(runId, { dryRun: false });
    expect(conflict.status).toBe(409);
    const conflictBody = (await conflict.json()) as {
      error: { code: string; details: { totals: { conflict: number } } };
    };
    expect(conflictBody.error.code).toBe('FILE_ROLLBACK_CONFLICT');
    expect(conflictBody.error.details.totals.conflict).toBe(1);

    const forced = await post(runId, { dryRun: false, force: [file] });
    expect(forced.status).toBe(200);
    expect(existsSync(file)).toBe(false);
  });

  it('覆盖写回滚恢复旧内容', async () => {
    const file = join(services.fileSafety.guard.defaultRoot, 'overwrite.txt');
    writeFileSync(file, 'old');
    const snapshot = services.fileSafety.snapshotService.beforeWrite({
      runId,
      workflowId: 'wf',
      toolName: 'write_file',
      path: file,
    })!;
    writeFileSync(file, 'new');
    services.fileSafety.snapshotService.afterWrite({
      snapshotId: snapshot.id,
      writtenSha256: sha256OfBuffer(Buffer.from('new')),
    });

    const response = await post(runId, { dryRun: false });
    expect(response.status).toBe(200);
    expect(readFileSync(file, 'utf8')).toBe('old');
  });

  it('运行不存在返回 404', async () => {
    const response = await post('missing', { dryRun: true });
    expect(response.status).toBe(404);
  });
});
