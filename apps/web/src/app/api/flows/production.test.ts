import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createDatabase, createWorkflowRepository, type DatabaseInstance } from '@wbfm/database';
import { resetDataRootForTest, setDataRootForTest } from '@wbfm/config';
import { createWebCipher } from '@wbfm/core/secrets';
import type { FlowGraph } from '@wbfm/shared/schemas';
import { __buildContainerForTest, __setContainerForTest } from '@/lib/server/container';
import { GET as getFlow } from './[id]/route';
import { GET as listVersions } from './[id]/versions/route';
import { POST as publishFlow } from './[id]/publish/route';
import { POST as setProduction } from './[id]/production/route';

const graph: FlowGraph = {
  nodes: [
    { id: 'start', type: 'start', position: { x: 0, y: 0 }, config: {} },
    { id: 'end', type: 'end', position: { x: 200, y: 0 }, config: {} },
  ],
  edges: [{ id: 'e1', source: 'start', target: 'end' }],
};

const jsonRequest = (body: unknown, method = 'POST') =>
  new Request('http://127.0.0.1/x', {
    method,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });

const idParams = (id: string) => ({ params: Promise.resolve({ id }) });

async function readData<T>(response: Response): Promise<T> {
  return (await response.json()).data as T;
}

describe('工作流生产版本（v2.14 M2）', () => {
  let db: DatabaseInstance;
  let workflows: ReturnType<typeof createWorkflowRepository>;
  let workflowId: string;

  beforeEach(() => {
    setDataRootForTest(mkdtempSync(join(tmpdir(), 'wbfm-web-flow-production-')));
    db = createDatabase(':memory:');
    __buildContainerForTest(db, createWebCipher());
    workflows = createWorkflowRepository(db);
    workflowId = workflows.createWorkflow({ name: '生产流' }).id;
  });

  afterEach(() => {
    __setContainerForTest(null);
    db.close();
    resetDataRootForTest();
  });

  it('发布 v1 后保存 v2 草稿：生产版本保持 v1，列表标记正确', async () => {
    workflows.addVersion(workflowId, graph);
    const published = await publishFlow(
      new Request('http://x', { method: 'POST' }),
      idParams(workflowId),
    );
    expect(published.status).toBe(200);
    expect((await readData<{ publishedVersion: number }>(published)).publishedVersion).toBe(1);

    workflows.addVersion(workflowId, graph);
    const versions = await readData<
      Array<{ version: number; production: boolean; publishedAt: string | null }>
    >(await listVersions(new Request('http://x'), idParams(workflowId)));
    expect(versions.map((item) => item.version)).toEqual([2, 1]);
    expect(versions.find((item) => item.version === 1)?.production).toBe(true);
    expect(versions.find((item) => item.version === 2)?.production).toBe(false);

    const detail = await readData<{
      workflow: { status: string; currentVersion: number; publishedVersion: number | null };
    }>(await getFlow(new Request('http://x'), idParams(workflowId)));
    expect(detail.workflow).toMatchObject({
      status: 'draft',
      currentVersion: 2,
      publishedVersion: 1,
    });
  });

  it('设为生产：切换生产版本但不改当前草稿；可回退到旧版本', async () => {
    workflows.addVersion(workflowId, graph);
    workflows.publishVersion(workflowId);
    workflows.addVersion(workflowId, graph);

    const setV2 = await setProduction(jsonRequest({ version: 2 }), idParams(workflowId));
    expect(setV2.status).toBe(200);
    const v2 = await readData<{ publishedVersion: number; currentVersion: number }>(setV2);
    expect(v2.publishedVersion).toBe(2);
    expect(v2.currentVersion).toBe(2);

    workflows.addVersion(workflowId, graph);
    const rollback = await setProduction(jsonRequest({ version: 1 }), idParams(workflowId));
    const rolled = await readData<{ publishedVersion: number; currentVersion: number }>(rollback);
    expect(rolled.publishedVersion).toBe(1);
    expect(rolled.currentVersion).toBe(3);
  });

  it('显式发布指定历史版本：同步当前与生产版本', async () => {
    workflows.addVersion(workflowId, graph);
    workflows.publishVersion(workflowId);
    workflows.addVersion(workflowId, graph);

    const response = await publishFlow(jsonRequest({ version: 1 }), idParams(workflowId));
    const data = await readData<{ publishedVersion: number; currentVersion: number }>(response);
    expect(data.publishedVersion).toBe(1);
    expect(data.currentVersion).toBe(1);
  });

  it('错误：版本不存在 404；非法 body 422；工作流不存在 404', async () => {
    workflows.addVersion(workflowId, graph);
    const missing = await setProduction(jsonRequest({ version: 99 }), idParams(workflowId));
    expect(missing.status).toBe(404);
    expect((await missing.json()).error.code).toBe('FLOW_VERSION_NOT_FOUND');

    const invalid = await setProduction(jsonRequest({ version: 'x' }), idParams(workflowId));
    expect(invalid.status).toBe(422);

    const noFlow = await setProduction(jsonRequest({ version: 1 }), idParams('missing'));
    expect(noFlow.status).toBe(404);
  });
});
