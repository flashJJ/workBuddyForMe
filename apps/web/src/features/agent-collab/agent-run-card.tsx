'use client';

import * as React from 'react';
import { Ban, CheckCircle2, MonitorPlay, ShieldQuestion, TriangleAlert, Users, XCircle } from 'lucide-react';
import { FailureHint } from '@/components/common/failure-hint';
import { RunStatusBadge } from '@/components/common/run-status-badge';
import { useI18n } from '@/lib/i18n/use-i18n';
import { useSystemText } from '@/lib/i18n/use-system-text';
import { toOutcome } from '@/lib/runs/run-outcome';
import { getStageBridge } from '@/features/stage/stage-bridge';
import { cn } from '@/lib/utils';
import { AgentRounds } from './agent-rounds';
import type { AgentCardState, AgentCardStatus } from './agent-run-reducer';

/**
 * v1.9 M2：在舞台只读观看本 run。
 * Electron 走舞台窗 IPC（与桌宠互斥/几何恢复由主进程负责）；
 * 裸浏览器开新标签承载 /stage?run=。舞台无任何 run 控制权。
 */
function openRunStage(runId: string): void {
  const bridge = getStageBridge();
  if (bridge) {
    void bridge.open({ runId });
    return;
  }
  window.open(`/stage?run=${encodeURIComponent(runId)}`, '_blank', 'noopener,noreferrer');
}

/**
 * v1.4 M4：协作运行卡（聊天内嵌/Flow 子泳道/任务中心共用）。
 * 预算条由 agent_budget 帧实时驱动；终态样式区分 done/budget_exceeded/failed/cancelled。
 */
export function AgentRunCard({
  state,
  runId,
  compact = false,
  showSummary = false,
}: {
  state: AgentCardState;
  runId: string;
  /** Flow 时间线内嵌时更紧凑 */
  compact?: boolean;
  /** 任务中心/Flow 上下文显示结论（聊天页结论由消息正文承载） */
  showSummary?: boolean;
}) {
  const { t } = useI18n();
  const sys = useSystemText();
  const terminal = state.status !== 'connecting' && state.status !== 'running';
  const outcome = toOutcome('agent', state.status);
  return (
    <div
      className="min-w-0 overflow-hidden rounded-lg border bg-card text-xs shadow-sm"
      data-testid="agent-run-card"
      data-status={state.status}
    >
      <header className="border-b px-3 py-2">
        <div className="flex items-center gap-2">
          <Users className="h-4 w-4 shrink-0 text-teal-500" />
          <span className="text-xs font-semibold">{t('agents.entry.label')}</span>
          <RunStatusBadge kind="agent" status={state.status} />
          <button
            type="button"
            className="ml-auto flex items-center gap-1 rounded border border-teal-500/40 px-1.5 py-0.5 text-[10px] text-teal-600 transition-colors hover:bg-teal-500/10 dark:text-teal-400"
            data-testid="watch-on-stage"
            title={t('stage.run.watchReadonlyHint')}
            onClick={() => openRunStage(runId)}
          >
            <MonitorPlay className="h-3 w-3" />
            {t('stage.run.watch')}
          </button>
          <span className="font-mono text-[10px] text-muted-foreground">{runId.slice(0, 8)}</span>
        </div>
        <p className="mt-1 flex items-center gap-1 text-[10px] text-muted-foreground">
          <MonitorPlay className="h-3 w-3 shrink-0" />
          {t('stage.run.watchReadonlyHint')}
        </p>
      </header>

      <div className={cn('space-y-2 px-3', compact ? 'py-2' : 'py-2.5')}>
        <BudgetBar state={state} />
        {state.pendingConfirm && (
          <div className="flex items-center gap-1.5 rounded-md border border-warning/40 bg-warning/10 px-2 py-1 text-[11px] text-warning">
            <ShieldQuestion className="h-3.5 w-3.5 shrink-0" />
            {t('agents.confirm.waiting')}
          </div>
        )}
        <AgentRounds rounds={state.rounds} />
        {showSummary && state.summary && (
          <p className="min-w-0 whitespace-pre-wrap break-words rounded-md bg-muted/50 p-2 text-[11px] leading-relaxed">{sys(state.summary)}</p>
        )}
        {terminal && <TerminalBanner status={state.status} exceeded={state.status === 'budget_exceeded'} />}
        <FailureHint outcome={outcome} rawError={state.errorMessage} />
      </div>
    </div>
  );
}

function Metric({ used, max, label, danger }: { used: number; max: number; label: string; danger: boolean }) {
  return (
    <span
      className={cn(
        'rounded px-1.5 py-0.5 font-mono text-[10px]',
        danger ? 'bg-destructive/10 text-destructive' : 'bg-muted text-muted-foreground',
      )}
      title={danger ? label : undefined}
    >
      {label}
    </span>
  );
}

function BudgetBar({ state }: { state: AgentCardState }) {
  const { t } = useI18n();
  const u = state.usage;
  const b = state.budget;
  if (!u || !b) return null;
  const currentRound = u.round + 1;
  const over = {
    rounds: currentRound > b.maxRounds,
    steps: u.steps > b.maxSteps,
    tokens: u.totalTokens > b.maxTotalTokens,
  };
  return (
    <div className="flex flex-wrap items-center gap-1.5" data-testid="agent-budget-bar">
      <Metric used={currentRound} max={b.maxRounds} danger={over.rounds} label={t('agents.budget.rounds', { used: currentRound, max: b.maxRounds })} />
      <Metric used={u.steps} max={b.maxSteps} danger={over.steps} label={t('agents.budget.steps', { used: u.steps, max: b.maxSteps })} />
      <Metric used={u.totalTokens} max={b.maxTotalTokens} danger={over.tokens} label={t('agents.budget.tokens', { used: u.totalTokens, max: b.maxTotalTokens })} />
    </div>
  );
}

function TerminalBanner({ status, exceeded }: { status: AgentCardStatus; exceeded: boolean }) {
  const { t } = useI18n();
  if (status === 'done') {
    return (
      <p className="flex items-center gap-1.5 text-[11px] text-success">
        <CheckCircle2 className="h-3.5 w-3.5" />
        {t('agents.terminal.done')}
      </p>
    );
  }
  if (exceeded) {
    return (
      <p className="flex items-start gap-1.5 rounded-md bg-warning/10 p-1.5 text-[11px] text-warning">
        <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        {t('agents.terminal.budgetExceeded')}
      </p>
    );
  }
  if (status === 'cancelled') {
    return (
      <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
        <Ban className="h-3.5 w-3.5" />
        {t('agents.terminal.cancelled')}
      </p>
    );
  }
  return (
    <p className="flex items-center gap-1.5 text-[11px] text-destructive">
      <XCircle className="h-3.5 w-3.5" />
      {t('agents.terminal.failed')}
    </p>
  );
}
