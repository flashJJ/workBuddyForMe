'use client';

import * as React from 'react';
import { AlertTriangle, Ban, CheckCircle2, RotateCcw, X, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { FailureHint } from '@/components/common/failure-hint';
import { RunStatusBadge } from '@/components/common/run-status-badge';
import { useToast } from '@/components/common/toast';
import { useI18n } from '@/lib/i18n/use-i18n';
import { ApiClientError, apiPost } from '@/lib/api/client';
import { API } from '@/lib/api/endpoints';
import { useFlowRunAction, type FlowLiveState } from '@/lib/hooks/use-flows';
import type { SsePayloadMap } from '@wbfm/shared/api';
import { ToolConfirmDialog } from '../chat/tool-confirm-dialog';
import type { FlowCanvasNode } from '../flow-editor/graph-utils';
import { ExecutionTimeline } from './execution-timeline';
import { WaitingCard } from './waiting-card';

interface ExecutionPanelProps {
  runId: string;
  nodes: FlowCanvasNode[];
  live: FlowLiveState;
  onClose: () => void;
  onRerun: () => void;
}

export function ExecutionPanel({ runId, nodes, live, onClose, onRerun }: ExecutionPanelProps) {
  const { t } = useI18n();
  const actions = useFlowRunAction(runId);
  const toast = useToast();
  const terminal = live.phase === 'succeeded' || live.phase === 'failed' || live.phase === 'cancelled';
  const waitingNode = live.waitingNodeId ? nodes.find((n) => n.id === live.waitingNodeId) : null;

  // v1.4：agent 节点内 Executor 的桌面工具门控帧（最新一条未决策且运行未结束时弹窗）
  const [resolvedGates, setResolvedGates] = React.useState<ReadonlySet<string>>(new Set());
  const pendingGate = React.useMemo(() => {
    for (let i = live.events.length - 1; i >= 0; i -= 1) {
      const e = live.events[i]!;
      if (e.type === 'node_agent_event' && e.event.event === 'agent_tool_confirm') {
        return e.event.data as SsePayloadMap['agent_tool_confirm'];
      }
    }
    return null;
  }, [live.events]);
  const activeGate =
    pendingGate && !terminal && !resolvedGates.has(pendingGate.callId) ? pendingGate : null;

  const submitGate = async (
    action: 'allow' | 'deny',
    remember?: 'assistant' | 'all' | 'task',
  ): Promise<boolean> => {
    if (!activeGate) return false;
    const extra =
      remember === 'task' ? { remember, taskScope: activeGate.taskScope } : {};
    try {
      await apiPost(API.toolConfirm, {
        callId: activeGate.callId,
        tool: activeGate.tool,
        action,
        ...extra,
      });
      setResolvedGates((prev) => new Set(prev).add(activeGate!.callId));
      return true;
    } catch (error) {
      toast.error(error instanceof ApiClientError ? error.message : t('flowExecution.actionFailed'));
      return false;
    }
  };

  const guard = (error: unknown) =>
    toast.error(error instanceof ApiClientError ? error.message : t('flowExecution.actionFailed'));

  const submitHuman = async (approved: boolean) => {
    if (!live.waitingNodeId) return;
    try {
      await actions.submitHuman.mutateAsync({ nodeId: live.waitingNodeId, approved, values: {} });
    } catch (e) {
      guard(e);
    }
  };
  const submitTool = async (allowed: boolean) => {
    if (!live.waitingNodeId) return;
    try {
      await actions.submitToolConfirm.mutateAsync({ nodeId: live.waitingNodeId, allowed });
    } catch (e) {
      guard(e);
    }
  };
  const cancel = async () => {
    try {
      await actions.cancel.mutateAsync();
    } catch (e) {
      guard(e);
    }
  };

  return (
    <section className="flex h-80 shrink-0 flex-col border-t bg-card">
      <header className="flex items-center gap-2 border-b px-4 py-2">
        <p className="text-sm font-semibold">{t('flowExecution.title')}</p>
        <RunStatusBadge kind="flow" status={live.phase} />
        <span className="font-mono text-[10px] text-muted-foreground">{runId.slice(0, 8)}</span>
        {live.connection === 'error' && !terminal && (
          <span className="flex items-center gap-1 text-[11px] text-warning">
            <AlertTriangle className="h-3 w-3" />
            {t('flowExecution.connectionError')}
          </span>
        )}
        <div className="ml-auto flex items-center gap-1.5">
          {!terminal && (
            <Button variant="outline" size="sm" onClick={cancel} disabled={actions.cancel.isPending}>
              <Ban className="h-3.5 w-3.5" />
              {t('flowExecution.cancelRun')}
            </Button>
          )}
          {terminal && (
            <Button variant="outline" size="sm" onClick={onRerun}>
              <RotateCcw className="h-3.5 w-3.5" />
              {t('flowExecution.rerun')}
            </Button>
          )}
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto py-2">
        {waitingNode && (
          <WaitingCard
            node={waitingNode}
            busy={actions.submitHuman.isPending || actions.submitToolConfirm.isPending}
            onSubmitHuman={submitHuman}
            onToolConfirm={submitTool}
          />
        )}
        <ExecutionTimeline events={live.events} nodes={nodes} />
        {live.phase === 'succeeded' && (
          <div className="mx-4 my-2 rounded-md border border-success/30 bg-success-background p-2.5">
            <p className="flex items-center gap-1.5 text-xs font-medium text-success">
              <CheckCircle2 className="h-3.5 w-3.5" />
              {t('flowExecution.finalOutput')}
            </p>
            <pre className="mt-1 max-h-32 overflow-auto whitespace-pre-wrap break-all font-mono text-[11px]">
              {stringify(live.output, t('flowExecution.emptyOutput'))}
            </pre>
          </div>
        )}
        {live.phase === 'failed' && (
          <div className="mx-4 my-2 rounded-md border border-destructive/30 bg-destructive/10 p-2.5">
            <p className="flex items-center gap-1.5 text-xs font-medium text-destructive">
              <XCircle className="h-3.5 w-3.5" />
              {t('flowExecution.runFailed')}
            </p>
            <FailureHint className="mt-1" outcome="failed" rawError={live.errorMessage} />
          </div>
        )}
      </div>
      {activeGate && (
        <ToolConfirmDialog
          open
          origin="agent"
          hideAllowAlways
          tool={activeGate.tool}
          permission={activeGate.permission}
          argsSummary={activeGate.argsSummary}
          submitting={false}
          taskScopeAvailable
          onOpenChange={(open) => {
            if (!open) void submitGate('deny');
          }}
          onSubmit={submitGate}
        />
      )}
    </section>
  );
}

function stringify(value: unknown, emptyText: string): string {
  if (value === null || value === undefined || value === '') return emptyText;
  if (typeof value === 'string') return value;
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}
