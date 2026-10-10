'use client';

import * as React from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import type { FlowNodeExecStatus } from '@wbfm/shared/types';
import type { FlowNodeType } from '@wbfm/shared/schemas';
import { cn } from '@/lib/utils';
import { useI18n } from '@/lib/i18n/use-i18n';
import type { MessageKey } from '@wbfm/shared/i18n';
import { NODE_META, nodeTitle } from './node-meta';
import { configSummary, type FlowCanvasNode } from './graph-utils';
import { useFlowStatus } from './flow-status-context';

const STATUS_RING: Record<FlowNodeExecStatus, string> = {
  running: 'ring-2 ring-info shadow-info/30 shadow-lg',
  succeeded: 'ring-2 ring-success/70',
  failed: 'ring-2 ring-destructive',
  skipped: 'opacity-45',
  waiting_human: 'ring-2 ring-warning shadow-warning/30 shadow-lg animate-pulse',
};

const STATUS_LABEL: Record<FlowNodeExecStatus, MessageKey> = {
  running: 'flowEditor.node.status.running',
  succeeded: 'flowEditor.node.status.succeeded',
  failed: 'flowEditor.node.status.failed',
  skipped: 'flowEditor.node.status.skipped',
  waiting_human: 'flowEditor.node.status.waitingHuman',
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
  const { t } = useI18n();
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
        hasError && 'border-destructive border-dashed ring-1 ring-destructive/60',
        hasWarning && 'border-warning border-dashed',
        status && STATUS_RING[status],
      )}
    >
      <div className="flex items-center gap-2">
        <meta.icon className={cn('h-4 w-4 shrink-0', meta.accent)} />
        <span className="flex-1 truncate text-sm font-medium">{nodeTitle(t, type, config)}</span>
        {status && (
          <span className="shrink-0 text-[10px] text-muted-foreground">{t(STATUS_LABEL[status])}</span>
        )}
      </div>
      <p className="mt-1 truncate text-[11px] text-muted-foreground">
        {configSummary(t, type, config)}
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
  const { t } = useI18n();
  return (
    <NodeShell id={id} type="condition" config={data.config} selected={selected}>
      <TargetHandle />
      <Handle
        id="true"
        type="source"
        position={Position.Right}
        style={{ top: '32%' }}
        className="!h-2.5 !w-2.5 !bg-success"
      />
      <Handle
        id="false"
        type="source"
        position={Position.Right}
        style={{ top: '72%' }}
        className="!h-2.5 !w-2.5 !bg-destructive"
      />
      <span className="pointer-events-none absolute right-[-26px] top-[24%] text-[10px] font-medium text-success">
        {t('flowEditor.node.branch.yes')}
      </span>
      <span className="pointer-events-none absolute right-[-26px] top-[64%] text-[10px] font-medium text-destructive">
        {t('flowEditor.node.branch.no')}
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
