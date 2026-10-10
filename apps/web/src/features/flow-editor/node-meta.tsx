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
import type { FlowNodeType } from '@wbfm/shared/schemas';
import type { MessageKey, MessageVars } from '@wbfm/shared/i18n';

/** 翻译函数形态（与 useI18n 的 t 一致，供纯工具函数接收使用） */
export type TranslateFn = (key: MessageKey, vars?: MessageVars) => string;

/** 节点类型展示元数据（面板/画布/配置共用的唯一事实源；文案字段存 MessageKey，渲染处用 t() 解析） */
export interface NodeMeta {
  type: FlowNodeType;
  label: MessageKey;
  description: MessageKey;
  icon: LucideIcon;
  /** 节点强调色（tailwind 类片段，用于徽标/句柄/描边） */
  accent: string;
  /** 插入变量时可引用的 outputs 字段（start 用 params，动态字段另行处理） */
  outputFields: Array<{ key: string; hint: MessageKey }>;
}

export const NODE_META: Record<FlowNodeType, NodeMeta> = {
  start: {
    type: 'start',
    label: 'flowEditor.node.start.label',
    description: 'flowEditor.node.start.description',
    icon: Play,
    accent: 'text-emerald-600 dark:text-emerald-400',
    outputFields: [],
  },
  llm: {
    type: 'llm',
    label: 'flowEditor.node.llm.label',
    description: 'flowEditor.node.llm.description',
    icon: BrainCircuit,
    accent: 'text-violet-600 dark:text-violet-400',
    outputFields: [
      { key: 'text', hint: 'flowEditor.node.llm.outputs.text' },
      { key: 'tokens', hint: 'flowEditor.node.llm.outputs.tokens' },
    ],
  },
  knowledgeSearch: {
    type: 'knowledgeSearch',
    label: 'flowEditor.node.knowledgeSearch.label',
    description: 'flowEditor.node.knowledgeSearch.description',
    icon: Library,
    accent: 'text-sky-600 dark:text-sky-400',
    outputFields: [
      { key: 'context', hint: 'flowEditor.node.knowledgeSearch.outputs.context' },
      { key: 'chunks', hint: 'flowEditor.node.knowledgeSearch.outputs.chunks' },
    ],
  },
  tool: {
    type: 'tool',
    label: 'flowEditor.node.tool.label',
    description: 'flowEditor.node.tool.description',
    icon: Wrench,
    accent: 'text-amber-600 dark:text-amber-400',
    outputFields: [
      { key: 'output', hint: 'flowEditor.node.tool.outputs.output' },
      { key: 'ok', hint: 'flowEditor.node.tool.outputs.ok' },
      { key: 'summary', hint: 'flowEditor.node.tool.outputs.summary' },
    ],
  },
  condition: {
    type: 'condition',
    label: 'flowEditor.node.condition.label',
    description: 'flowEditor.node.condition.description',
    icon: GitBranch,
    accent: 'text-pink-600 dark:text-pink-400',
    outputFields: [{ key: 'result', hint: 'flowEditor.node.condition.outputs.result' }],
  },
  human: {
    type: 'human',
    label: 'flowEditor.node.human.label',
    description: 'flowEditor.node.human.description',
    icon: UserCheck,
    accent: 'text-orange-600 dark:text-orange-400',
    outputFields: [
      { key: 'approved', hint: 'flowEditor.node.human.outputs.approved' },
      { key: 'values', hint: 'flowEditor.node.human.outputs.values' },
    ],
  },
  end: {
    type: 'end',
    label: 'flowEditor.node.end.label',
    description: 'flowEditor.node.end.description',
    icon: Square,
    accent: 'text-slate-600 dark:text-slate-300',
    outputFields: [{ key: 'output', hint: 'flowEditor.node.end.outputs.output' }],
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

/** 节点标题：优先读 config.label（用户自填），其次类型默认名（经 t 翻译） */
export function nodeTitle(t: TranslateFn, type: FlowNodeType, config: Record<string, unknown>): string {
  const custom = config.label;
  return typeof custom === 'string' && custom.trim() ? custom.trim() : t(NODE_META[type].label);
}

/** 生成引用插值 token */
export function buildRefToken(nodeId: string, bucket: 'outputs' | 'params', field?: string): string {
  return `{{$nodes.${nodeId}.${bucket}${field ? `.${field}` : ''}}}`;
}

export function NodeIcon({ type, className }: { type: FlowNodeType; className?: string }) {
  const Icon = NODE_META[type].icon;
  return <Icon className={className} />;
}
