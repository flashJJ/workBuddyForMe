import { describe, expect, it, vi } from 'vitest';
import type { WorkflowRepository, WorkflowRunRepository } from '@wbfm/database';
import type { FlowGraph } from '@wbfm/shared/schemas';
import type { WorkflowRunView } from '@wbfm/shared/types';
import {
  diffRunGraph,
  loadRunGraph,
  parseRunGraphSnapshot,
  serializeRunGraph,
} from '../run-snapshot';

const graphA = {
  nodes: [
    { id: 'start', type: 'start', position: { x: 0, y: 0 } },
    { id: 'end', type: 'end', position: { x: 1, y: 1 } },
  ],
  edges: [{ id: 'e1', source: 'start', target: 'end' }],
} as FlowGraph;

const graphB = {
  nodes: [
    { id: 'start', type: 'start', position: { x: 0, y: 0 } },
    { id: 'tool', type: 'tool', position: { x: 1, y: 1 } },
    { id: 'end', type: 'end', position: { x: 2, y: 2 } },
  ],
  edges: [
    { id: 'e1', source: 'start', target: 'tool' },
    { id: 'e2', source: 'tool', target: 'end' },
  ],
} as FlowGraph;

function runView(): WorkflowRunView {
  return {
    id: 'run-1',
    workflowId: 'wf-1',
    version: 3,
    trigger: 'manual',
    status: 'failed',
    input: {},
    output: null,
    error: null,
    conversationId: null,
    waitNodeId: null,
    startedAt: null,
    finishedAt: null,
    createdAt: 't',
    endpointId: null,
    parentRunId: null,
    resumedFromNode: null,
    interruptReason: null,
    graphHash: 'hash',
    replayBatchId: null,
  };
}

describe('v5.0 运行图快照', () => {
  it('canonical 序列化稳定，哈希随内容变化', () => {
    const a = serializeRunGraph(graphA);
    const b = serializeRunGraph({
      edges: graphA.edges,
      nodes: [...graphA.nodes].reverse(),
    } as FlowGraph);
    expect(a.hash).toHaveLength(64);
    expect(a.hash).not.toBe(b.hash); // 数组保序：节点顺序不同即不同图
    const parsed = parseRunGraphSnapshot(a.json);
    expect(parsed?.nodes).toHaveLength(2);
    expect(parseRunGraphSnapshot('not-json')).toBeNull();
  });

  it('载图优先快照，其次精确版本，缺失则阻断', () => {
    const runs = {
      getGraphSnapshot: vi.fn(() => ({ graphJson: JSON.stringify(graphA), hash: 'h' })),
    } as unknown as WorkflowRunRepository;
    const workflows = { getVersion: vi.fn() } as unknown as WorkflowRepository;
    const loaded = loadRunGraph({ run: runView(), workflows, runs });
    expect(loaded.source).toBe('snapshot');
    expect(loaded.version).toBe(3);
    expect(workflows.getVersion).not.toHaveBeenCalled();

    runs.getGraphSnapshot = vi.fn(() => null) as never;
    workflows.getVersion = vi.fn(() => ({
      version: 3,
      graph: graphA,
    })) as never;
    const fallback = loadRunGraph({ run: runView(), workflows, runs });
    expect(fallback.source).toBe('version');
    expect(workflows.getVersion).toHaveBeenCalledWith('wf-1', 3);

    runs.getGraphSnapshot = vi.fn(() => null) as never;
    workflows.getVersion = vi.fn(() => null) as never;
    expect(() => loadRunGraph({ run: runView(), workflows, runs })).toThrow(
      /flow\/run-graph-unavailable/,
    );
  });

  it('版本差异：新增/删除/类型变化，失败节点被删除时阻断节点重放', () => {
    const changed = diffRunGraph({
      snapshot: graphA,
      current: graphB,
      runVersion: 3,
      currentVersion: 4,
      failedNodeId: 'end',
    });
    expect(changed.reason).toBe('version_changed');
    expect(changed.addedNodeIds).toEqual(['tool']);
    expect(changed.canResumeFromFailedNode).toBe(true); // end 仍在且类型未变
    expect(changed.currentVersion).toBe(4);

    const removed = diffRunGraph({
      snapshot: graphB,
      current: graphA,
      runVersion: 3,
      currentVersion: 4,
      failedNodeId: 'tool',
    });
    expect(removed.reason).toBe('node_removed');
    expect(removed.removedNodeIds).toContain('tool');
    expect(removed.canResumeFromFailedNode).toBe(false);

    const same = diffRunGraph({
      snapshot: graphA,
      current: graphA,
      runVersion: 3,
      currentVersion: 3,
    });
    expect(same.reason).toBe('same');
    expect(same.canResumeFromFailedNode).toBe(true);

    const unavailable = diffRunGraph({
      snapshot: graphA,
      current: null,
      runVersion: 3,
      currentVersion: null,
    });
    expect(unavailable.reason).toBe('graph_unavailable');
  });
});
