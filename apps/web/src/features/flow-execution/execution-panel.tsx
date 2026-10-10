'use client';

import * as React from 'react';
import { AlertTriangle, Ban, CheckCircle2, RotateCcw, X, XCircle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/common/toast';
import { useI18n } from '@/lib/i18n/use-i18n';
import type { MessageKey } from '@wbfm/shared/i18n';
import { ApiClientError } from '@/lib/api/client';
import { useFlowRunAction, type FlowLiveState, type FlowRunPhase } from '@/lib/hooks/use-flows';
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

const PHASE_BADGE: Record<FlowRunPhase, { label: MessageKey; variant: 'default' | 'success' | 'danger' | 'warning' | 'outline' }> = {
  connecting: { label: 'flowExecution.phase.connecting', variant: 'warning' },
  running: { label: 'flowExecution.phase.running', variant: 'default' },
  succeeded: { label: 'flowExecution.phase.succeeded', variant: 'success' },
  failed: { label: 'flowExecution.phase.failed', variant: 'danger' },
  cancelled: { label: 'flowExecution.phase.cancelled', variant: 'outline' },
};

export function ExecutionPanel({ runId, nodes, live, onClose, onRerun }: ExecutionPanelProps) {
  const { t } = useI18n();
  const actions = useFlowRunAction(runId);
  const toast = useToast();
  const terminal = live.phase === 'succeeded' || live.phase === 'failed' || live.phase === 'cancelled';
  const waitingNode = live.waitingNodeId ? nodes.find((n) => n.id === live.waitingNodeId) : null;
  const badge = PHASE_BADGE[live.phase];

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
        <Badge variant={badge.variant}>{t(badge.label)}</Badge>
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
            <p className="mt-1 text-[11px]">{live.errorMessage ?? t('flowExecution.unknownError')}</p>
          </div>
        )}
      </div>
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
