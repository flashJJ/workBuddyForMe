'use client';

import * as React from 'react';
import {
  CheckCircle2,
  ChevronRight,
  Circle,
  Loader2,
  MinusCircle,
  PauseCircle,
  XCircle,
} from 'lucide-react';
import type { FlowEventPayload } from '@wbfm/shared/types';
import type { FlowNodeType } from '@wbfm/shared/schemas';
import type { MessageKey, MessageVars } from '@wbfm/shared/i18n';
import { cn } from '@/lib/utils';
import { useI18n } from '@/lib/i18n/use-i18n';
import { AgentRunCard } from '../agent-collab';
import { buildAgentView } from './agent-node-view';
import { NODE_META, nodeTitle } from '../flow-editor/node-meta';
import type { FlowCanvasNode } from '../flow-editor/graph-utils';

/** useI18n 返回的翻译函数形状（模块级 helper 需经调用方传入） */
type TFn = (key: MessageKey, vars?: MessageVars) => string;

const NODE_EVENTS = new Set([
  'node_started',
  'node_succeeded',
  'node_skipped',
  'node_waiting_human',
  'node_failed',
]);

const EVENT_LABEL_KEYS: Record<string, MessageKey> = {
  node_started: 'flowExecution.event.running',
  node_succeeded: 'flowExecution.event.succeeded',
  node_skipped: 'flowExecution.event.skipped',
  node_waiting_human: 'flowExecution.event.waitingHuman',
  node_failed: 'flowExecution.event.failed',
};

interface TimelineProps {
  events: FlowEventPayload[];
  nodes: FlowCanvasNode[];
}

interface RowModel {
  key: string;
  nodeId: string;
  events: FlowEventPayload[];
  isAgent: boolean;
}

/** 逐节点事件时间线：agent 节点聚合成单行并可展开只读子泳道（v1.4 M4） */
export function ExecutionTimeline({ events, nodes }: TimelineProps) {
  const { t } = useI18n();
  const rows = buildRows(events, nodes);
  if (rows.length === 0) {
    return <p className="px-4 py-3 text-xs text-muted-foreground">{t('flowExecution.waitingEvents')}</p>;
  }
  return (
    <ol className="flex flex-col">
      {rows.map((row) =>
        row.isAgent ? (
          <AgentTimelineRow key={row.key} row={row} nodes={nodes} />
        ) : (
          <TimelineRow key={row.key} event={row.events[0]!} nodes={nodes} />
        ),
      )}
    </ol>
  );
}

function buildRows(events: FlowEventPayload[], nodes: FlowCanvasNode[]): RowModel[] {
  const rows: RowModel[] = [];
  const agentRowIndex = new Map<string, number>();
  for (const e of events) {
    // run_failed.nodeId 为可选，需显式收窄到 string
    if (!('nodeId' in e) || typeof e.nodeId !== 'string') continue;
    const node = nodes.find((n) => n.id === e.nodeId);
    if (node?.type === 'agent') {
      let idx = agentRowIndex.get(e.nodeId);
      if (idx === undefined) {
        idx = rows.length;
        agentRowIndex.set(e.nodeId, idx);
        rows.push({ key: `agent-${e.nodeId}`, nodeId: e.nodeId, events: [], isAgent: true });
      }
      rows[idx]!.events.push(e);
    } else if (NODE_EVENTS.has(e.type)) {
      rows.push({ key: `${e.type}-${rows.length}`, nodeId: e.nodeId, events: [e], isAgent: false });
    }
  }
  return rows;
}

/** agent 节点：单行标题 + 展开只读协作子泳道（帧实时驱动） */
function AgentTimelineRow({ row, nodes }: { row: RowModel; nodes: FlowCanvasNode[] }) {
  const [open, setOpen] = React.useState(true);
  const { t } = useI18n();
  const node = nodes.find((n) => n.id === row.nodeId);
  const type = (node?.type ?? 'agent') as FlowNodeType;
  const meta = NODE_META[type];
  const title = node ? nodeTitle(t, node.type, node.data.config) : row.nodeId;
  const failed = row.events.some((e) => e.type === 'node_failed');
  const succeeded = row.events.some((e) => e.type === 'node_succeeded');
  const statusType = failed ? 'node_failed' : succeeded ? 'node_succeeded' : 'node_started';
  const view = React.useMemo(() => buildAgentView(row.events, node), [row.events, node]);

  return (
    <li className="border-b px-4 py-2.5 last:border-b-0">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-1.5 text-left"
        aria-expanded={open}
      >
        {eventIcon(statusType, meta.accent)}
        <meta.icon className={cn('h-3.5 w-3.5 shrink-0', meta.accent)} />
        <span className="truncate text-xs font-medium">{title}</span>
        <span className="shrink-0 text-[10px] text-muted-foreground">{eventLabel(statusType, t)}</span>
        <ChevronRight className={cn('ml-auto h-3.5 w-3.5 shrink-0 text-muted-foreground', open && 'rotate-90')} />
      </button>
      {open && view && (
        <div className="mt-2" data-testid={`agent-sub-swimlane-${row.nodeId}`}>
          <AgentRunCard state={view.state} runId={view.runId} compact showSummary />
        </div>
      )}
    </li>
  );
}

function TimelineRow({ event, nodes }: { event: FlowEventPayload; nodes: FlowCanvasNode[] }) {
  const [open, setOpen] = React.useState(false);
  const { t } = useI18n();
  if (!('nodeId' in event) || typeof event.nodeId !== 'string') return null;
  const node = nodes.find((n) => n.id === event.nodeId);
  const type = (node?.type ?? 'llm') as FlowNodeType;
  const meta = NODE_META[type];
  const title = node ? nodeTitle(t, type, node.data.config) : event.nodeId;
  const hasDetail =
    ('inputs' in event && event.inputs !== undefined) ||
    ('outputs' in event && event.outputs !== undefined) ||
    ('reason' in event && event.reason) ||
    ('message' in event && event.message);

  return (
    <li className="flex gap-2.5 border-b px-4 py-2.5 last:border-b-0">
      <span className="mt-0.5 shrink-0">{eventIcon(event.type, meta.accent)}</span>
      <div className="min-w-0 flex-1">
        <button
          type="button"
          disabled={!hasDetail}
          onClick={() => setOpen((v) => !v)}
          className="flex w-full items-center gap-1.5 text-left disabled:cursor-default"
        >
          <meta.icon className={cn('h-3.5 w-3.5 shrink-0', meta.accent)} />
          <span className="truncate text-xs font-medium">{title}</span>
          <span className="shrink-0 text-[10px] text-muted-foreground">{eventLabel(event.type, t)}</span>
          {'durationMs' in event && typeof event.durationMs === 'number' && (
            <span className="shrink-0 text-[10px] text-muted-foreground">{event.durationMs}ms</span>
          )}
          {hasDetail && (
            <ChevronRight className={cn('ml-auto h-3.5 w-3.5 shrink-0 text-muted-foreground', open && 'rotate-90')} />
          )}
        </button>
        {'message' in event && event.message && (
          <p className="mt-1 text-[11px] leading-snug text-destructive">{event.message}</p>
        )}
        {'reason' in event && event.reason && (
          <p className="mt-1 text-[11px] text-muted-foreground">{event.reason}</p>
        )}
        {open && hasDetail && (
          <div className="mt-1.5 space-y-1.5">
            {'inputs' in event && event.inputs !== undefined && (
              <JsonBlock title={t('flowExecution.inputs')} value={event.inputs} />
            )}
            {'outputs' in event && event.outputs !== undefined && (
              <JsonBlock title={t('flowExecution.outputs')} value={event.outputs} />
            )}
          </div>
        )}
      </div>
    </li>
  );
}

function JsonBlock({ title, value }: { title: string; value: unknown }) {
  return (
    <details className="rounded bg-muted/50 p-1.5">
      <summary className="cursor-pointer text-[10px] font-medium text-muted-foreground">
        {title}
      </summary>
      <pre className="mt-1 max-h-44 overflow-auto whitespace-pre-wrap break-all font-mono text-[10px] leading-relaxed">
        {safeStringify(value)}
      </pre>
    </details>
  );
}

function safeStringify(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function eventLabel(type: string, t: TFn): string {
  const key = EVENT_LABEL_KEYS[type];
  return key ? t(key) : type;
}

function eventIcon(type: string, accent: string) {
  switch (type) {
    case 'node_started':
      return <Loader2 className={cn('h-4 w-4 animate-spin', accent)} />;
    case 'node_succeeded':
      return <CheckCircle2 className="h-4 w-4 text-success" />;
    case 'node_skipped':
      return <MinusCircle className="h-4 w-4 text-slate-400" />;
    case 'node_waiting_human':
      return <PauseCircle className="h-4 w-4 animate-pulse text-warning" />;
    case 'node_failed':
      return <XCircle className="h-4 w-4 text-destructive" />;
    default:
      return <Circle className="h-4 w-4 text-muted-foreground" />;
  }
}
