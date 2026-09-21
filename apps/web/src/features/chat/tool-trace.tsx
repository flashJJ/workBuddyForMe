'use client';

import * as React from 'react';
import {
  Clock,
  Globe,
  Loader2,
  Search,
  CheckCircle2,
  AlertCircle,
  ChevronRight,
} from 'lucide-react';
import type { ToolName, ToolTraceEntry } from '@wbfm/shared';
import { cn } from '@/lib/utils';

const TOOL_META: Record<ToolName, { label: string; icon: typeof Clock }> = {
  current_time: { label: '查询当前时间', icon: Clock },
  knowledge_search: { label: '检索知识库', icon: Search },
  fetch_webpage: { label: '读取网页', icon: Globe },
};

function metaOf(name: ToolName): { label: string; icon: typeof Clock } {
  return TOOL_META[name] ?? { label: name, icon: Globe };
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function ToolRow({ entry }: { entry: ToolTraceEntry }) {
  const [open, setOpen] = React.useState(false);
  const { label, icon: Icon } = metaOf(entry.tool);
  const running = entry.status === 'running';
  const failed = entry.status === 'error';

  return (
    <div
      className="rounded-md border bg-muted/40 text-xs"
      data-testid="tool-trace-row"
      data-tool={entry.tool}
      data-status={entry.status}
    >
      <button
        type="button"
        className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        {running ? (
          <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-primary" />
        ) : failed ? (
          <AlertCircle className="h-3.5 w-3.5 shrink-0 text-red-500" />
        ) : (
          <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-green-600" />
        )}
        <Icon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        <span className="shrink-0 font-medium">{label}</span>
        {entry.argsSummary && (
          <span className="min-w-0 flex-1 truncate text-muted-foreground">{entry.argsSummary}</span>
        )}
        {!running && (
          <span className="shrink-0 tabular-nums text-muted-foreground">{formatDuration(entry.durationMs)}</span>
        )}
        <ChevronRight
          className={cn('h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform', open && 'rotate-90')}
        />
      </button>
      {open && (
        <dl className="space-y-1 border-t px-2.5 py-2 text-muted-foreground">
          <div className="flex gap-2">
            <dt className="w-16 shrink-0">工具名</dt>
            <dd className="font-mono text-foreground">{entry.tool}</dd>
          </div>
          {entry.argsSummary && (
            <div className="flex gap-2">
              <dt className="w-16 shrink-0">参数</dt>
              <dd className="break-all">{entry.argsSummary}</dd>
            </div>
          )}
          <div className="flex gap-2">
            <dt className="w-16 shrink-0">结果</dt>
            <dd className={cn('break-all', failed && 'text-red-600')}>{entry.resultSummary}</dd>
          </div>
        </dl>
      )}
    </div>
  );
}

/** 助手回复中的工具调用过程卡片（流式时实时刷新，历史消息从 tool_trace 渲染） */
export function ToolTrace({ trace }: { trace: ToolTraceEntry[] }) {
  if (trace.length === 0) return null;
  return (
    <div className="space-y-1" data-testid="tool-trace">
      {trace.map((entry) => (
        <ToolRow key={entry.callId} entry={entry} />
      ))}
    </div>
  );
}
