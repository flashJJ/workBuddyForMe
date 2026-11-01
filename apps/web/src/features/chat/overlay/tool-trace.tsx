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
import type { MessageKey, MessageVars } from '@wbfm/shared/i18n';
import { Badge } from '@/components/ui/badge';
import { useI18n } from '@/lib/i18n/use-i18n';
import { cn } from '@/lib/utils';

/** useI18n 返回的翻译函数形状（模块级 helper 需经调用方传入） */
type TFn = (key: MessageKey, vars?: MessageVars) => string;

const TOOL_META: Record<ToolName, { labelKey: MessageKey; icon: typeof Clock }> = {
  current_time: { labelKey: 'toolTrace.tools.currentTime', icon: Clock },
  knowledge_search: { labelKey: 'toolTrace.tools.knowledgeSearch', icon: Search },
  fetch_webpage: { labelKey: 'toolTrace.tools.fetchWebpage', icon: Globe },
  screen_snapshot: { labelKey: 'toolTrace.tools.screenSnapshot', icon: Monitor },
  mouse_move: { labelKey: 'toolTrace.tools.mouseMove', icon: MousePointer2 },
  mouse_click: { labelKey: 'toolTrace.tools.mouseClick', icon: MousePointerClick },
  mouse_scroll: { labelKey: 'toolTrace.tools.mouseScroll', icon: Mouse },
  keyboard_type: { labelKey: 'toolTrace.tools.keyboardType', icon: Keyboard },
  keyboard_press: { labelKey: 'toolTrace.tools.keyboardPress', icon: Keyboard },
  window_list: { labelKey: 'toolTrace.tools.windowList', icon: AppWindow },
  uia_list: { labelKey: 'toolTrace.tools.uiaList', icon: ListTree },
  window_focus: { labelKey: 'toolTrace.tools.windowFocus', icon: AppWindow },
  app_launch: { labelKey: 'toolTrace.tools.appLaunch', icon: Rocket },
};

interface ToolMeta {
  /** 内置工具/工作流的展示名 i18n 键；外部工具无键，回落 label */
  labelKey: MessageKey | null;
  /** 外部工具（MCP/未知）直接展示的限定名；内置工具缺省回落 entry.tool */
  label?: string;
  icon: typeof Clock;
}

/** v0.6：MCP 等外部工具名无内置元数据，展示限定名（mcp:<server>:<tool>）；v0.8 flow:<id> 统一展示为工作流 */
function metaOf(name: string): ToolMeta {
  if (name.startsWith('flow:')) return { labelKey: 'toolTrace.flow', label: '', icon: Workflow };
  return TOOL_META[name as ToolName] ?? { labelKey: null, label: name, icon: Wrench };
}

const SOURCE_LABEL_KEYS: Record<string, MessageKey> = {
  builtin: 'toolTrace.source.builtin',
  unknown: 'toolTrace.source.unknown',
  flow: 'toolTrace.source.flow',
};
const SOURCE_VARIANT: Record<string, 'default' | 'outline' | 'success' | 'warning' | 'danger'> = {
  builtin: 'default',
  unknown: 'outline',
  flow: 'success',
};
const PERMISSION_LABEL_KEYS: Record<PermissionLevel, MessageKey> = {
  read: 'toolTrace.permission.read',
  write: 'toolTrace.permission.write',
  danger: 'toolTrace.permission.danger',
};
const PERMISSION_VARIANT: Record<PermissionLevel, 'success' | 'warning' | 'danger'> = {
  read: 'success',
  write: 'warning',
  danger: 'danger',
};

function sourceLabel(source: string | undefined, t: TFn): string {
  if (!source) return '';
  const key = SOURCE_LABEL_KEYS[source];
  if (key) return t(key);
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
  const { t } = useI18n();
  const [open, setOpen] = React.useState(false);
  const meta = metaOf(entry.tool);
  const label = meta.labelKey ? t(meta.labelKey) : (meta.label ?? entry.tool);
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
        <meta.icon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        <span className="shrink-0 font-medium">{label}</span>
        {entry.source && <Badge variant={SOURCE_VARIANT[entry.source] ?? 'outline'} className="px-1.5 py-0 text-[10px]">{sourceLabel(entry.source, t)}</Badge>}
        {entry.permission && <Badge variant={PERMISSION_VARIANT[entry.permission]} className="px-1.5 py-0 text-[10px]">{t(PERMISSION_LABEL_KEYS[entry.permission])}</Badge>}
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
          aria-label={t('toolTrace.substepsAria', { name: label })}
        >
          {substeps.map((step) => (
            <SubstepRow key={step.id} step={step} />
          ))}
        </ul>
      )}
      {open && (
        <dl className="space-y-1 border-t px-2.5 py-2 text-muted-foreground">
          <div className="flex gap-2">
            <dt className="w-16 shrink-0">{t('toolTrace.detail.toolName')}</dt>
            <dd className="font-mono text-foreground">{entry.tool}</dd>
          </div>
          {entry.source && (
            <div className="flex gap-2">
              <dt className="w-16 shrink-0">{t('toolTrace.detail.source')}</dt>
              <dd>{sourceLabel(entry.source, t)}</dd>
            </div>
          )}
          {entry.permission && (
            <div className="flex gap-2">
              <dt className="w-16 shrink-0">{t('toolTrace.detail.permission')}</dt>
              <dd>{t(PERMISSION_LABEL_KEYS[entry.permission])}</dd>
            </div>
          )}
          {entry.argsSummary && (
            <div className="flex gap-2">
              <dt className="w-16 shrink-0">{t('toolTrace.detail.args')}</dt>
              <dd className="break-all">{entry.argsSummary}</dd>
            </div>
          )}
          <div className="flex gap-2">
            <dt className="w-16 shrink-0">{t('toolTrace.detail.result')}</dt>
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
