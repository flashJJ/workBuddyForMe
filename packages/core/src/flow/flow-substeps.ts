import type { FlowEventPayload, ToolSubstep } from '@wbfm/shared/types';
import type { FlowNode, FlowNodeType } from '@wbfm/shared/schemas';

/**
 * flow 运行事件 → 对话工具卡片子步骤（v0.8 P0-6）。
 * 节点标题取 config.label，缺省回退到中文类型名。
 */
export const FLOW_NODE_DEFAULT_LABELS: Record<FlowNodeType, string> = {
  start: '开始',
  llm: '大模型',
  knowledgeSearch: '知识检索',
  tool: '工具',
  condition: '条件分支',
  human: '人工确认',
  end: '结束',
};

export function flowNodeTitle(node: FlowNode): string {
  const label = node.config?.label;
  return typeof label === 'string' && label.trim() ? label.trim() : FLOW_NODE_DEFAULT_LABELS[node.type];
}

function clipDetail(text: unknown, max = 120): string | undefined {
  if (text === undefined || text === null) return undefined;
  const str = typeof text === 'string' ? text : JSON.stringify(text);
  const compact = str.replace(/\s+/g, ' ').trim();
  return compact.length > max ? `${compact.slice(0, max)}…` : compact;
}

type FlowNodeEvent = Extract<FlowEventPayload, { nodeId: string }>;

/**
 * 子步骤收集器：消费 FlowEventPayload 序列，维护每个节点最新状态的有序列表。
 * 对话触发执行时用它把引擎事件收敛为工具子步骤（实时回调 + 终态快照）。
 */
export interface FlowSubstepCollector {
  /** 吸收一条事件；若产生/更新了子步骤则返回它（run_* 事件返回 null） */
  absorb(event: FlowEventPayload): ToolSubstep | null;
  list(): ToolSubstep[];
}

export function createSubstepCollector(titleOf: (nodeId: string) => string): FlowSubstepCollector {
  const substeps: ToolSubstep[] = [];
  return {
    absorb(event) {
      const substep = flowEventToSubstep(event, titleOf);
      if (!substep) return null;
      const idx = substeps.findIndex((s) => s.id === substep.id);
      if (idx >= 0) substeps[idx] = substep;
      else substeps.push(substep);
      return substep;
    },
    list() {
      return substeps;
    },
  };
}

/** 节点级事件映射为子步骤；run_* 收尾事件返回 null */
export function flowEventToSubstep(
  event: FlowEventPayload,
  titleOf: (nodeId: string) => string,
): ToolSubstep | null {
  if (!('nodeId' in event)) return null;
  const nodeEvent = event as FlowNodeEvent;
  const id: string = nodeEvent.nodeId;
  const label: string = titleOf(id);
  switch (nodeEvent.type) {
    case 'node_started':
      return { id, label, status: 'running' };
    case 'node_succeeded':
      return {
        id,
        label,
        status: 'ok',
        ...(nodeEvent.outputs !== undefined ? { detail: clipDetail(nodeEvent.outputs) } : {}),
      };
    case 'node_skipped':
      return { id, label, status: 'skipped', detail: nodeEvent.reason };
    case 'node_waiting_human':
      return { id, label, status: 'running', detail: '等待人工确认' };
    case 'node_failed':
      return { id, label, status: 'error', detail: nodeEvent.message };
    default:
      return null;
  }
}
