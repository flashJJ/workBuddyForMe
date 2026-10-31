import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createDatabase, createWorkflowRepository, type DatabaseInstance } from '@wbfm/database';
import { resetDataRootForTest, setDataRootForTest } from '@wbfm/config';
import { createWebCipher } from '@wbfm/core/secrets';
import type { FlowGraph } from '@wbfm/shared/schemas';
import { __buildContainerForTest, __setContainerForTest } from '@/lib/server/container';
import { GET as compareVersions } from './route';

const v1: FlowGraph = {
  nodes: [
    { id: 'start', type: 'start', position: { x: 0, y: 0 }, config: {} },
    { id: 'end', type: 'end', position: { x: 200, y: 0 }, config: {} },
  ],
  edges: [{ id: 'e1', source: 'start', target: 'end' }],
};

const v2: FlowGraph = {
  nodes: [
    { id: 'start', type: 'start', position: { x: 0, y: 0 }, config: {} },
    { id: 'llm', type: 'llm', position: { x: 400, y: 0 }, config: { modelId: 'm1' } },
    { id: 'end', type: 'end', position: { x: 600, y: 0 }, config: {} },
  ],
  edges: [
    { id: 'e1', source: 'start', target: 'llm' },
    { id: 'e2', source: 'llm', target: 'end' },
  ],
};

const idParams = (id: string) => ({ params: Promise.resolve({ id }) });

async function readData<T>(response: Response): Promise<T> {
  return (await response.json()).data as T;
}

describe('工作流版本对比（v2.15 M4）', () => {
  let db: DatabaseInstance;
  let workflows: ReturnType<typeof createWorkflowRepository>;
  let workflowId: string;

  beforeEach(() => {
    setDataRootForTest(mkdtempSync(join(tmpdir(), 'wbfm-web-flow-compare-')));
    db = createDatabase(':memory:');
    __buildContainerForTest(db, createWebCipher());
    workflows = createWorkflowRepository(db);
    workflowId = workflows.createWorkflow({ name: '对比流' }).id;
    workflows.addVersion(workflowId, v1);
    workflows.addVersion(workflowId, v2);
  });

  afterEach(() => {
    __setContainerForTest(null);
    db.close();
    resetDataRootForTest();
  });

  it('正常对比：返回节点 / 边差异与 summary', async () => {
    const response = await compareVersions(
      new Request(`http://x?from=1&to=2`),
      idParams(workflowId),
    );
    expect(response.status).toBe(200);
    const diff = await readData<{
      from: number;
      to: number;
      nodes: { added: Array<{ id: string; type: string }> };
      edges: { added: Array<{ source: string; target: string }>; removed: unknown[] };
      summary: { nodesAdded: number; edgesAdded: number; edgesRemoved: number };
    }>(response);
    expect(diff.from).toBe(1);
    expect(diff.to).toBe(2);
    expect(diff.nodes.added).toEqual([{ id: 'llm', type: 'llm' }]);
    expect(diff.edges.added).toEqual([
      { source: 'llm', target: 'end', handle: null },
      { source: 'start', target: 'llm', handle: null },
    ]);
    expect(diff.edges.removed).toEqual([
      { source: 'start', target: 'end', handle: null },
    ]);
    expect(diff.summary.nodesAdded).toBe(1);
    expect(diff.summary.edgesAdded).toBe(2);
    expect(diff.summary.edgesRemoved).toBe(1);
  });

  it('相同版本对比：返回全零差异', async () => {
    const response = await compareVersions(
      new Request(`http://x?from=2&to=2`),
      idParams(workflowId),
    );
    const diff = await readData<{ summary: Record<string, number> }>(response);
    expect(diff.summary).toEqual({
      nodesAdded: 0,
      nodesRemoved: 0,
      nodesTypeChanged: 0,
      nodesConfigChanged: 0,
      edgesAdded: 0,
      edgesRemoved: 0,
    });
  });

  it('版本不存在：404 FLOW_VERSION_NOT_FOUND', async () => {
    const response = await compareVersions(
      new Request(`http://x?from=1&to=99`),
      idParams(workflowId),
    );
    expect(response.status).toBe(404);
    expect((await response.json()).error.code).toBe('FLOW_VERSION_NOT_FOUND');
  });

  it('工作流不存在：404', async () => {
    const response = await compareVersions(
      new Request(`http://x?from=1&to=2`),
      idParams('missing'),
    );
    expect(response.status).toBe(404);
  });

  it('非法查询参数：422', async () => {
    const response = await compareVersions(
      new Request(`http://x?from=abc&to=2`),
      idParams(workflowId),
    );
    expect(response.status).toBe(422);
  });
});
