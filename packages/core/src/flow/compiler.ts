import type { FlowDiagnostic, FlowGraph } from '@wbfm/shared';
import {
  buildAdjacency,
  findCyclePath,
  reachableFrom,
  reverseReachableTo,
  topoSortKahn,
} from './graph-utils';
import type { CompiledFlow } from './types';

export interface CompileResult {
  ok: boolean;
  /** error 阻断编译；warning 不阻断（如 condition 某分支未使用） */
  diagnostics: FlowDiagnostic[];
  compiled?: CompiledFlow;
}

function diagnostic(
  severity: FlowDiagnostic['severity'],
  code: string,
  message: string,
  ref: { nodeId?: string; edgeId?: string } = {},
): FlowDiagnostic {
  return { severity, code, message, ...ref };
}
const error = (code: string, message: string, ref?: { nodeId?: string; edgeId?: string }) =>
  diagnostic('error', `flow/${code}`, message, ref);

/**
 * 编译流程图：结构校验（环/端点/句柄/可达/入度）→ Kahn 拓扑计划。
 * 假设输入已通过 flowGraphSchema（zod）校验；本函数只做跨节点语义校验。
 */
export function compileFlow(graph: FlowGraph): CompileResult {
  const diagnostics: FlowDiagnostic[] = [];
  const nodesById = new Map(graph.nodes.map((n) => [n.id, n]));

  // 1. 节点 id 唯一
  const seenNodeIds = new Set<string>();
  for (const node of graph.nodes) {
    if (seenNodeIds.has(node.id)) {
      diagnostics.push(error('duplicate-node', `节点 id 重复：${node.id}`, { nodeId: node.id }));
    }
    seenNodeIds.add(node.id);
  }

  // 2. 边 id 唯一 + 端点存在 + 自环 + 重复边 + 句柄规则
  const seenEdgeIds = new Set<string>();
  const seenEdgeKeys = new Set<string>();
  for (const edge of graph.edges) {
    if (seenEdgeIds.has(edge.id)) {
      diagnostics.push(error('duplicate-edge', `连线 id 重复：${edge.id}`, { edgeId: edge.id }));
    }
    seenEdgeIds.add(edge.id);

    if (!nodesById.has(edge.source)) {
      diagnostics.push(error('unknown-edge-endpoint', `连线起点不存在：${edge.source}`, { edgeId: edge.id }));
    }
    if (!nodesById.has(edge.target)) {
      diagnostics.push(error('unknown-edge-endpoint', `连线终点不存在：${edge.target}`, { edgeId: edge.id }));
    }
    if (edge.source === edge.target) {
      diagnostics.push(error('self-loop', '节点不允许自环', { edgeId: edge.id, nodeId: edge.source }));
    }

    const sourceNode = nodesById.get(edge.source);
    const sourceIsCondition = sourceNode?.type === 'condition';
    if (edge.sourceHandle && !sourceIsCondition) {
      diagnostics.push(
        error('invalid-handle', '仅 condition 节点允许 true/false 分支句柄', { edgeId: edge.id }),
      );
    }
    if (sourceIsCondition && !edge.sourceHandle) {
      diagnostics.push(
        error('invalid-handle', 'condition 节点的出边必须声明 true/false 分支句柄', { edgeId: edge.id }),
      );
    }

    const edgeKey = `${edge.source}:${edge.sourceHandle ?? '-'}->${edge.target}`;
    if (seenEdgeKeys.has(edgeKey)) {
      diagnostics.push(error('duplicate-edge', `重复连线：${edgeKey}`, { edgeId: edge.id }));
    }
    seenEdgeKeys.add(edgeKey);
  }

  // 3. start/end 数量与端点约束
  const startNodes = graph.nodes.filter((n) => n.type === 'start');
  const endNodes = graph.nodes.filter((n) => n.type === 'end');
  if (startNodes.length !== 1) {
    diagnostics.push(error('start-count', `流程图必须恰好有 1 个 start 节点（当前 ${startNodes.length} 个）`));
  }
  if (endNodes.length < 1) {
    diagnostics.push(error('end-count', '流程图至少需要 1 个 end 节点'));
  }
  const adj = buildAdjacency(graph);
  for (const node of graph.nodes) {
    if (node.type === 'start' && (adj.indegree.get(node.id) ?? 0) > 0) {
      diagnostics.push(error('terminal-edges', 'start 节点不允许有入边', { nodeId: node.id }));
    }
    if (node.type === 'end' && (adj.successors.get(node.id)?.length ?? 0) > 0) {
      diagnostics.push(error('terminal-edges', 'end 节点不允许有出边', { nodeId: node.id }));
    }
  }

  // 4. 无环（DFS；拓扑排序也会兜底，这里给出带环路径的诊断）
  const cycle = findCyclePath(graph, adj);
  if (cycle) {
    diagnostics.push(
      error('cycle', `流程图不允许出现环：${cycle.join(' → ')}`, { nodeId: cycle[0] }),
    );
  }

  // 5. 普通节点（除 end 外）MVP 限定单入边（需要汇聚时用 end 节点）
  for (const node of graph.nodes) {
    if (node.type === 'end' || node.type === 'start') continue;
    const ins = adj.indegree.get(node.id) ?? 0;
    if (ins > 1) {
      diagnostics.push(
        error('multiple-incoming', `节点「${node.id}」有 ${ins} 条入边；MVP 仅 end 节点支持汇聚`, {
          nodeId: node.id,
        }),
      );
    }
    if (ins === 0) {
      diagnostics.push(error('missing-incoming', `节点「${node.id}」没有入边（孤立）`, { nodeId: node.id }));
    }
  }

  // 6. 可达性：每个节点必须从 start 可达，且能到达某个 end
  if (startNodes.length === 1 && endNodes.length >= 1 && !cycle) {
    const startId = startNodes[0]!.id;
    const forward = reachableFrom(startId, adj);
    const backward = reverseReachableTo(
      endNodes.map((n) => n.id),
      adj,
    );
    for (const node of graph.nodes) {
      if (node.type === 'start') continue;
      if (!forward.has(node.id)) {
        diagnostics.push(error('unreachable-node', `节点「${node.id}」无法从 start 到达`, { nodeId: node.id }));
      }
      if (!backward.has(node.id)) {
        diagnostics.push(error('dead-node', `节点「${node.id}」没有通向 end 的路径`, { nodeId: node.id }));
      }
    }

    // 7. condition 的 true/false 两个分支都必须连线并通向 end：
    //    未连线的命中分支在运行时无路可走（无法产出 end 结果），故按错误处理。
    for (const node of graph.nodes.filter((n) => n.type === 'condition')) {
      const handles = new Set(
        (adj.successors.get(node.id) ?? []).map((s) => s.handle).filter(Boolean),
      );
      for (const branch of ['true', 'false'] as const) {
        if (!handles.has(branch)) {
          diagnostics.push(
            error('missing-branch', `条件节点「${node.id}」的 ${branch} 分支未连线`, {
              nodeId: node.id,
            }),
          );
        }
      }
    }
  }

  const errors = diagnostics.filter((d) => d.severity === 'error');
  if (errors.length > 0 || startNodes.length !== 1 || endNodes.length < 1 || cycle) {
    return { ok: false, diagnostics };
  }

  const order = topoSortKahn(graph, adj);
  if (!order) {
    diagnostics.push(error('cycle', '拓扑排序失败（图中存在环）'));
    return { ok: false, diagnostics };
  }

  const compiled: CompiledFlow = {
    graph,
    nodesById,
    edgesById: new Map(graph.edges.map((edge) => [edge.id, edge])),
    order,
    startNodeId: startNodes[0]!.id,
    endNodeIds: endNodes.map((n) => n.id),
    predecessors: adj.predecessors,
    successors: adj.successors,
  };
  return { ok: true, diagnostics, compiled };
}
