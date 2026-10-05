import * as React from 'react';
import {
  Play,
  Square,
  BrainCircuit,
  Library,
  Wrench,
  GitBranch,
  UserCheck,
  type LucideIcon,
} from 'lucide-react';
import type { FlowNodeType } from '@wbfm/shared';

/** 节点类型展示元数据（面板/画布/配置共用的唯一事实源） */
export interface NodeMeta {
  type: FlowNodeType;
  label: string;
  description: string;
  icon: LucideIcon;
  /** 节点强调色（tailwind 类片段，用于徽标/句柄/描边） */
  accent: string;
  /** 插入变量时可引用的 outputs 字段（start 用 params，动态字段另行处理） */
  outputFields: Array<{ key: string; hint: string }>;
}

export const NODE_META: Record<FlowNodeType, NodeMeta> = {
  start: {
    type: 'start',
    label: '开始',
    description: '声明流程入参',
    icon: Play,
    accent: 'text-emerald-600 dark:text-emerald-400',
    outputFields: [],
  },
  llm: {
    type: 'llm',
    label: '大模型',
    description: '一次性生成完整文本',
    icon: BrainCircuit,
    accent: 'text-violet-600 dark:text-violet-400',
    outputFields: [
      { key: 'text', hint: '生成文本' },
      { key: 'tokens', hint: 'token 用量' },
    ],
  },
  knowledgeSearch: {
    type: 'knowledgeSearch',
    label: '知识检索',
    description: '在知识库中语义检索',
    icon: Library,
    accent: 'text-sky-600 dark:text-sky-400',
    outputFields: [
      { key: 'context', hint: '拼好的参考资料文本' },
      { key: 'chunks', hint: '命中文块数组' },
    ],
  },
  tool: {
    type: 'tool',
    label: '工具',
    description: '调用内置 / MCP / 流程工具',
    icon: Wrench,
    accent: 'text-amber-600 dark:text-amber-400',
    outputFields: [
      { key: 'output', hint: '执行结果文本' },
      { key: 'ok', hint: '是否成功' },
      { key: 'summary', hint: '结果摘要' },
    ],
  },
  condition: {
    type: 'condition',
    label: '条件分支',
    description: '声明式规则，确定性分流',
    icon: GitBranch,
    accent: 'text-pink-600 dark:text-pink-400',
    outputFields: [{ key: 'result', hint: 'true / false' }],
  },
  human: {
    type: 'human',
    label: '人工确认',
    description: '挂起等待人工审核',
    icon: UserCheck,
    accent: 'text-orange-600 dark:text-orange-400',
    outputFields: [
      { key: 'approved', hint: '是否通过' },
      { key: 'values', hint: '回填表单值' },
    ],
  },
  end: {
    type: 'end',
    label: '结束',
    description: '映射流程最终输出',
    icon: Square,
    accent: 'text-slate-600 dark:text-slate-300',
    outputFields: [{ key: 'output', hint: '最终结果' }],
  },
};

/** 面板中可拖拽添加的节点（start/end 由模板保证唯一，不在面板重复添加） */
export const PALETTE_TYPES: FlowNodeType[] = [
  'llm',
  'knowledgeSearch',
  'tool',
  'condition',
  'human',
];

/** 节点标题：优先读 config.label，其次类型默认名 */
export function nodeTitle(type: FlowNodeType, config: Record<string, unknown>): string {
  const custom = config.label;
  return typeof custom === 'string' && custom.trim() ? custom.trim() : NODE_META[type].label;
}

/** 生成引用插值 token */
export function buildRefToken(nodeId: string, bucket: 'outputs' | 'params', field?: string): string {
  return `{{$nodes.${nodeId}.${bucket}${field ? `.${field}` : ''}}}`;
}

export function NodeIcon({ type, className }: { type: FlowNodeType; className?: string }) {
  const Icon = NODE_META[type].icon;
  return <Icon className={className} />;
}
