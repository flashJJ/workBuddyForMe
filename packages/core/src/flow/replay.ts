import type { CompiledFlow } from './types';

/**
 * v0.9 重放式重跑（方案 §5.2）：
 * 从失败节点重跑 = 新建 run 执行「目标节点祖先闭包」子图。
 * 闭包 = 目标节点 + 沿入边反向可达的全部节点（保证从 start 到目标的完整上游段）。
 * 跨版本图变化按当前发布图重新计算，天然避免引用失效；闭包外节点不执行。
 *
 * 目标不在图中时回退为仅目标自身（引擎执行时会给出活性/节点缺失等明确事件）。
 */
export function computeReplayClosure(
  compiled: CompiledFlow,
  targetNodeId: string,
): Set<string> {
  const closure = new Set<string>();
  if (!compiled.nodesById.has(targetNodeId)) {
    closure.add(targetNodeId);
    return closure;
  }
  const stack = [targetNodeId];
  while (stack.length > 0) {
    const current = stack.pop()!;
    if (closure.has(current)) continue;
    closure.add(current);
    for (const predecessor of compiled.predecessors.get(current) ?? []) {
      if (!closure.has(predecessor)) stack.push(predecessor);
    }
  }
  return closure;
}
