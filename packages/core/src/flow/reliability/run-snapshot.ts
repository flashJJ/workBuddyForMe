import { createHash } from 'node:crypto';
import { ApiError } from '@wbfm/shared/errors';
import { canonicalJsonStringify, flowGraphSchema } from '@wbfm/shared/schemas';
import type { FlowGraph } from '@wbfm/shared/schemas';
import type { FlowRunVersionCheck, WorkflowRunView } from '@wbfm/shared/types';
import type { WorkflowRepository, WorkflowRunRepository } from '@wbfm/database';

/**
 * v5.0 运行图快照：
 * - 运行创建时固化 FlowGraph + canonical JSON 的 SHA-256；
 * - 续跑/重放优先用快照，其次按 run.version 精确取，绝不静默回退当前生产图；
 * - diffRunGraph 为版本差异检查（只读，列表页不调用）。
 */

export function serializeRunGraph(graph: FlowGraph): { json: string; hash: string } {
  const json = canonicalJsonStringify(graph);
  return { json, hash: createHash('sha256').update(json).digest('hex') };
}

export function parseRunGraphSnapshot(raw: string | null | undefined): FlowGraph | null {
  if (!raw) return null;
  try {
    const parsed = flowGraphSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export interface LoadRunGraphParams {
  run: WorkflowRunView;
  workflows: WorkflowRepository;
  runs: WorkflowRunRepository;
}

export function loadRunGraph(params: LoadRunGraphParams): {
  graph: FlowGraph;
  version: number;
  source: 'snapshot' | 'version';
} {
  const snapshot = params.runs.getGraphSnapshot(params.run.id);
  const fromSnapshot = parseRunGraphSnapshot(snapshot?.graphJson);
  if (fromSnapshot) {
    return { graph: fromSnapshot, version: params.run.version, source: 'snapshot' };
  }
  const versionView = params.workflows.getVersion(params.run.workflowId, params.run.version);
  if (versionView) {
    return { graph: versionView.graph, version: versionView.version, source: 'version' };
  }
  throw ApiError.conflict(
    `原版本 v${params.run.version} 的流程图已被删除，无法续跑；请按新版本重放 [flow/run-graph-unavailable]`,
  );
}

export interface DiffRunGraphParams {
  snapshot: FlowGraph;
  current: FlowGraph | null;
  runVersion: number;
  currentVersion: number | null;
  failedNodeId?: string | null;
}

export function diffRunGraph(params: DiffRunGraphParams): FlowRunVersionCheck {
  const { snapshot, current, runVersion, currentVersion, failedNodeId } = params;
  if (!current) {
    return {
      runVersion,
      currentVersion,
      addedNodeIds: [],
      removedNodeIds: [],
      changedNodeIds: [],
      canResumeFromFailedNode: false,
      reason: 'graph_unavailable',
    };
  }
  const before = new Map(snapshot.nodes.map((node) => [node.id, node.type]));
  const after = new Map(current.nodes.map((node) => [node.id, node.type]));
  const addedNodeIds = [...after.keys()].filter((id) => !before.has(id)).sort();
  const removedNodeIds = [...before.keys()].filter((id) => !after.has(id)).sort();
  const changedNodeIds = [...before.entries()]
    .filter(([id, type]) => after.has(id) && after.get(id) !== type)
    .map(([id]) => id)
    .sort();
  const changed = addedNodeIds.length > 0 || removedNodeIds.length > 0 || changedNodeIds.length > 0;
  const failedRemoved = Boolean(failedNodeId && removedNodeIds.includes(failedNodeId));
  const failedChanged = Boolean(failedNodeId && changedNodeIds.includes(failedNodeId));
  return {
    runVersion,
    currentVersion,
    addedNodeIds,
    removedNodeIds,
    changedNodeIds,
    canResumeFromFailedNode: !failedRemoved && !failedChanged,
    reason: failedRemoved ? 'node_removed' : changed ? 'version_changed' : 'same',
  };
}
