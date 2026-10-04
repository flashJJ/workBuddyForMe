import type { FlowGraph } from '@wbfm/shared';
import type { SuccessorRef } from './types';

/**
 * 图结构分析原语：邻接表、Kahn 拓扑排序、DFS 环检测、可达性。
 * 纯函数、无业务语义，供 compiler 复用。
 */

export interface Adjacency {
  successors: Map<string, SuccessorRef[]>;
  predecessors: Map<string, string[]>;
  /** 入边条数（condition 两条分支到同一目标计 2） */
  indegree: Map<string, number>;
}

export function buildAdjacency(graph: FlowGraph): Adjacency {
  const successors = new Map<string, SuccessorRef[]>();
  const predecessors = new Map<string, string[]>();
  const indegree = new Map<string, number>();
  for (const node of graph.nodes) {
    successors.set(node.id, []);
    predecessors.set(node.id, []);
    indegree.set(node.id, 0);
  }
  for (const edge of graph.edges) {
    successors.get(edge.source)?.push({
      node: edge.target,
      edgeId: edge.id,
      handle: edge.sourceHandle,
    });
    predecessors.get(edge.target)?.push(edge.source);
    indegree.set(edge.target, (indegree.get(edge.target) ?? 0) + 1);
  }
  return { successors, predecessors, indegree };
}

/**
 * Kahn 拓扑排序：返回拓扑序节点 id；存在环时返回 null。
 * 同层顺序按 nodes 数组出现顺序（确定性输出，便于测试与稳定执行）。
 */
export function topoSortKahn(graph: FlowGraph, adj: Adjacency): string[] | null {
  const indegree = new Map(adj.indegree);
  const order: string[] = [];
  // 初始零入度队列（保持声明顺序）
  const queue = graph.nodes.filter((n) => (indegree.get(n.id) ?? 0) === 0).map((n) => n.id);
  const enqueueSorted = (ids: string[]) => {
    ids.sort((a, b) => graph.nodes.findIndex((n) => n.id === a) - graph.nodes.findIndex((n) => n.id === b));
  };
  enqueueSorted(queue);

  while (queue.length > 0) {
    const id = queue.shift()!;
    order.push(id);
    for (const succ of adj.successors.get(id) ?? []) {
      const next = (indegree.get(succ.node) ?? 0) - 1;
      indegree.set(succ.node, next);
      if (next === 0) queue.push(succ.node);
    }
    enqueueSorted(queue);
  }
  return order.length === graph.nodes.length ? order : null;
}

/** DFS 三色环检测；发现回边时返回环上的节点 id 路径（用于诊断），无环返回 null */
export function findCyclePath(graph: FlowGraph, adj: Adjacency): string[] | null {
  const WHITE = 0;
  const GRAY = 1;
  const BLACK = 2;
  const color = new Map<string, number>(graph.nodes.map((n) => [n.id, WHITE]));
  const stack: string[] = [];

  const dfs = (id: string): string[] | null => {
    color.set(id, GRAY);
    stack.push(id);
    for (const succ of adj.successors.get(id) ?? []) {
      const c = color.get(succ.node) ?? WHITE;
      if (c === GRAY) {
        const start = stack.indexOf(succ.node);
        return [...stack.slice(start), succ.node];
      }
      if (c === WHITE) {
        const cycle = dfs(succ.node);
        if (cycle) return cycle;
      }
    }
    stack.pop();
    color.set(id, BLACK);
    return null;
  };

  for (const node of graph.nodes) {
    if (color.get(node.id) === WHITE) {
      const cycle = dfs(node.id);
      if (cycle) return cycle;
    }
  }
  return null;
}

/** 从起点沿出边可达的全部节点（含起点） */
export function reachableFrom(startId: string, adj: Adjacency): Set<string> {
  const seen = new Set<string>([startId]);
  const queue = [startId];
  while (queue.length > 0) {
    const id = queue.shift()!;
    for (const succ of adj.successors.get(id) ?? []) {
      if (!seen.has(succ.node)) {
        seen.add(succ.node);
        queue.push(succ.node);
      }
    }
  }
  return seen;
}

/** 反向可达：能沿入边到达任一目标集合的节点（含目标），用于「必须能到达 end」校验 */
export function reverseReachableTo(targetIds: string[], adj: Adjacency): Set<string> {
  const seen = new Set<string>(targetIds);
  const queue = [...targetIds];
  while (queue.length > 0) {
    const id = queue.shift()!;
    for (const pred of adj.predecessors.get(id) ?? []) {
      if (!seen.has(pred)) {
        seen.add(pred);
        queue.push(pred);
      }
    }
  }
  return seen;
}
