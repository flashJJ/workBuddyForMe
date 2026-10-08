'use client';

import * as React from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import type { FlowNodeExecStatus } from '@wbfm/shared/types';
import type { FlowNodeType } from '@wbfm/shared/schemas';
import { cn } from '@/lib/utils';
import { NODE_META, nodeTitle } from './node-meta';
import { configSummary, type FlowCanvasNode } from './graph-utils';
import { useFlowStatus } from './flow-status-context';

const STATUS_RING: Record<FlowNodeExecStatus, string> = {
  running: 'ring-2 ring-blue-500 shadow-blue-500/30 shadow-lg',
  succeeded: 'ring-2 ring-emerald-500/70',
  failed: 'ring-2 ring-red-500',
  skipped: 'opacity-45',
  waiting_human: 'ring-2 ring-amber-500 shadow-amber-500/30 shadow-lg animate-pulse',
};

const STATUS_LABEL: Record<FlowNodeExecStatus, string> = {
  running: '运行中',
  succeeded: '成功',
  failed: '失败',
  skipped: '跳过',
  waiting_human: '待处理',
};

interface ShellProps {
  id: string;
  type: FlowNodeType;
  config: Record<string, unknown>;
  selected?: boolean;
  children?: React.ReactNode;
}

/** 统一节点外观：图标 + 标题 + 摘要 + 状态描边 */
function NodeShell({ id, type, config, selected, children }: ShellProps) {
  const meta = NODE_META[type];
  const { nodeStatus, errorNodeIds, warningNodeIds } = useFlowStatus();
  const status = nodeStatus[id];
  const hasError = errorNodeIds.has(id);
  const hasWarning = !hasError && warningNodeIds.has(id);

  return (
    <div
      className={cn(
        'w-52 rounded-lg border bg-card px-3 py-2.5 text-left shadow-sm transition-shadow',
        selected && 'border-primary ring-1 ring-primary',
        hasError && 'border-red-500 border-dashed ring-1 ring-red-500/60',
        hasWarning && 'border-amber-500 border-dashed',
        status && STATUS_RING[status],
      )}
    >
      <div className="flex items-center gap-2">
        <meta.icon className={cn('h-4 w-4 shrink-0', meta.accent)} />
        <span className="flex-1 truncate text-sm font-medium">{nodeTitle(type, config)}</span>
        {status && (
          <span className="shrink-0 text-[10px] text-muted-foreground">{STATUS_LABEL[status]}</span>
        )}
      </div>
      <p className="mt-1 truncate text-[11px] text-muted-foreground">
        {configSummary(type, config)}
      </p>
      {children}
    </div>
  );
}

function TargetHandle() {
  return <Handle type="target" position={Position.Left} className="!h-2.5 !w-2.5 !bg-muted-foreground" />;
}

function SourceHandle() {
  return <Handle type="source" position={Position.Right} className="!h-2.5 !w-2.5 !bg-muted-foreground" />;
}

type FlowNodeProps = NodeProps<FlowCanvasNode>;

function makeNode(type: FlowNodeType) {
  return function FlowNode({ id, data, selected }: FlowNodeProps) {
    return (
      <NodeShell id={id} type={type} config={data.config} selected={selected}>
        {type !== 'start' && <TargetHandle />}
        {type !== 'end' && <SourceHandle />}
      </NodeShell>
    );
  };
}

/** 条件节点：右侧 true/false 两个分支句柄 */
function ConditionNode({ id, data, selected }: FlowNodeProps) {
  return (
    <NodeShell id={id} type="condition" config={data.config} selected={selected}>
      <TargetHandle />
      <Handle
        id="true"
        type="source"
        position={Position.Right}
        style={{ top: '32%' }}
        className="!h-2.5 !w-2.5 !bg-emerald-500"
      />
      <Handle
        id="false"
        type="source"
        position={Position.Right}
        style={{ top: '72%' }}
        className="!h-2.5 !w-2.5 !bg-red-400"
      />
      <span className="pointer-events-none absolute right-[-26px] top-[24%] text-[10px] font-medium text-emerald-600 dark:text-emerald-400">
        是
      </span>
      <span className="pointer-events-none absolute right-[-26px] top-[64%] text-[10px] font-medium text-red-500">
        否
      </span>
    </NodeShell>
  );
}

export const flowNodeTypes = {
  start: makeNode('start'),
  end: makeNode('end'),
  llm: makeNode('llm'),
  knowledgeSearch: makeNode('knowledgeSearch'),
  tool: makeNode('tool'),
  condition: ConditionNode,
  human: makeNode('human'),
} as const;
