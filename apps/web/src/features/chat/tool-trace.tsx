'use client';

import * as React from 'react';
import {
  Clock,
  Globe,
  Loader2,
  Monitor,
  Search,
  CheckCircle2,
  AlertCircle,
  ChevronRight,
  Wrench,
  MousePointer2,
  MousePointerClick,
  Mouse,
  Keyboard,
  AppWindow,
  ListTree,
  Rocket,
  Workflow,
  Minus,
} from 'lucide-react';
import type { ToolName } from '@wbfm/shared/constants';
import type { ToolSubstep, ToolTraceEntry, PermissionLevel } from '@wbfm/shared/types';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

const TOOL_META: Record<ToolName, { label: string; icon: typeof Clock }> = {
  current_time: { label: '查询当前时间', icon: Clock },
  knowledge_search: { label: '检索知识库', icon: Search },
  fetch_webpage: { label: '读取网页', icon: Globe },
  screen_snapshot: { label: '屏幕截图', icon: Monitor },
  mouse_move: { label: '鼠标移动', icon: MousePointer2 },
  mouse_click: { label: '鼠标点击', icon: MousePointerClick },
  mouse_scroll: { label: '鼠标滚轮', icon: Mouse },
  keyboard_type: { label: '键盘输入', icon: Keyboard },
  keyboard_press: { label: '组合键', icon: Keyboard },
  window_list: { label: '列出窗口', icon: AppWindow },
  uia_list: { label: '枚举窗口控件', icon: ListTree },
  window_focus: { label: '激活窗口', icon: AppWindow },
  app_launch: { label: '启动应用', icon: Rocket },
};

/** v0.6：MCP 等外部工具名无内置元数据，展示限定名（mcp:<server>:<tool>）；v0.8 flow:<id> 统一展示为工作流 */
function metaOf(name: string): { label: string; icon: typeof Clock } {
  if (name.startsWith('flow:')) return { label: '工作流', icon: Workflow };
  return TOOL_META[name as ToolName] ?? { label: name, icon: Wrench };
}

const SOURCE_LABELS: Record<string, string> = { builtin: '内置', unknown: '未知', flow: '流程' };
const SOURCE_VARIANT: Record<string, 'default' | 'outline' | 'success' | 'warning' | 'danger'> = {
  builtin: 'default',
  unknown: 'outline',
  flow: 'success',
};
const PERMISSION_LABELS: Record<PermissionLevel, string> = { read: '读', write: '写', danger: '危险' };
const PERMISSION_VARIANT: Record<PermissionLevel, 'success' | 'warning' | 'danger'> = {
  read: 'success',
  write: 'warning',
  danger: 'danger',
};

function sourceLabel(source?: string): string {
  if (!source) return '';
  if (SOURCE_LABELS[source]) return SOURCE_LABELS[source]!;
  if (source.startsWith('mcp:')) return `MCP / ${source.slice(4)}`;
  return source;
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function SubstepRow({ step }: { step: ToolSubstep }) {
  return (
    <li className="flex items-start gap-1.5 pl-5 leading-tight">
      <SubstepIcon status={step.status} />
      <span className="shrink-0 text-muted-foreground">{step.label}</span>
      {step.detail && (
        <span className="min-w-0 truncate text-muted-foreground/70" title={step.detail}>
          {step.detail}
        </span>
      )}
    </li>
  );
}

function SubstepIcon({ status }: { status: ToolSubstep['status'] }) {
  if (status === 'running') return <Loader2 className="mt-0.5 h-3 w-3 shrink-0 animate-spin text-info" />;
  if (status === 'error') return <AlertCircle className="mt-0.5 h-3 w-3 shrink-0 text-destructive" />;
  if (status === 'skipped') return <Minus className="mt-0.5 h-3 w-3 shrink-0 text-slate-400" />;
  return <CheckCircle2 className="mt-0.5 h-3 w-3 shrink-0 text-success" />;
}

function ToolRow({ entry }: { entry: ToolTraceEntry }) {
  const [open, setOpen] = React.useState(false);
  const { label, icon: Icon } = metaOf(entry.tool);
  const running = entry.status === 'running';
  const failed = entry.status === 'error';
  const substeps = entry.substeps ?? [];

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
          <AlertCircle className="h-3.5 w-3.5 shrink-0 text-destructive" />
        ) : (
          <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-success" />
        )}
        <Icon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        <span className="shrink-0 font-medium">{label}</span>
        {entry.source && <Badge variant={SOURCE_VARIANT[entry.source] ?? 'outline'} className="px-1.5 py-0 text-[10px]">{sourceLabel(entry.source)}</Badge>}
        {entry.permission && <Badge variant={PERMISSION_VARIANT[entry.permission]} className="px-1.5 py-0 text-[10px]">{PERMISSION_LABELS[entry.permission]}</Badge>}
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
      {substeps.length > 0 && (
        <ul
          data-testid="tool-substeps"
          className="space-y-1 border-t px-2.5 py-1.5"
          aria-label={`${label}子步骤`}
        >
          {substeps.map((step) => (
            <SubstepRow key={step.id} step={step} />
          ))}
        </ul>
      )}
      {open && (
        <dl className="space-y-1 border-t px-2.5 py-2 text-muted-foreground">
          <div className="flex gap-2">
            <dt className="w-16 shrink-0">工具名</dt>
            <dd className="font-mono text-foreground">{entry.tool}</dd>
          </div>
          {entry.source && (
            <div className="flex gap-2">
              <dt className="w-16 shrink-0">来源</dt>
              <dd>{sourceLabel(entry.source)}</dd>
            </div>
          )}
          {entry.permission && (
            <div className="flex gap-2">
              <dt className="w-16 shrink-0">权限</dt>
              <dd>{PERMISSION_LABELS[entry.permission]}</dd>
            </div>
          )}
          {entry.argsSummary && (
            <div className="flex gap-2">
              <dt className="w-16 shrink-0">参数</dt>
              <dd className="break-all">{entry.argsSummary}</dd>
            </div>
          )}
          <div className="flex gap-2">
            <dt className="w-16 shrink-0">结果</dt>
            <dd className={cn('break-all', failed && 'text-destructive')}>{entry.resultSummary}</dd>
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
