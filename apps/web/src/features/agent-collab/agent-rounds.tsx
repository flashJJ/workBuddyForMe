'use client';

import * as React from 'react';
import {
  Check,
  ClipboardList,
  FileText,
  Hammer,
  Loader2,
  ShieldCheck,
  TriangleAlert,
  X,
} from 'lucide-react';
import type { ReviewVerdict } from '@wbfm/shared/schemas';
import type { Citation } from '@wbfm/shared/types';
import type { MessageKey } from '@wbfm/shared/i18n';
import { Badge } from '@/components/ui/badge';
import { useI18n } from '@/lib/i18n/use-i18n';
import { useSystemText } from '@/lib/i18n/use-system-text';
import { cn } from '@/lib/utils';
import type { AgentRoundState } from './agent-run-reducer';

/**
 * v1.4 M4：协作泳道——按轮次分组的三角色卡片（规划/执行/审查）。
 * 返工在同组内追加新轮次，不新增消息气泡。
 */
export function AgentRounds({ rounds }: { rounds: AgentRoundState[] }) {
  return (
    <div className="space-y-2" data-testid="agent-rounds">
      {rounds.map((round) => (
        <RoundGroup key={round.round} round={round} />
      ))}
    </div>
  );
}

function RoundGroup({ round }: { round: AgentRoundState }) {
  const { t } = useI18n();
  return (
    <section className="rounded-md border bg-muted/20 p-2" data-testid={`agent-round-${round.round}`}>
      <header className="mb-1.5 flex items-center gap-1.5">
        <span className="text-[11px] font-semibold text-muted-foreground">
          {t('agents.round.label', { round: round.round + 1 })}
        </span>
        {round.round > 0 && <Badge variant="warning" className="px-1.5 py-0 text-[10px]">{t('agents.round.reworkBadge')}</Badge>}
        {round.activePhase && <Loader2 className="h-3 w-3 animate-spin text-info" />}
      </header>
      <div className="grid gap-1.5">
        <PlanningCard round={round} />
        <ExecutionCard round={round} />
        <ReviewCard round={round} />
      </div>
    </section>
  );
}

function LaneShell({
  icon,
  title,
  active,
  tone,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  active: boolean;
  tone: string;
  children: React.ReactNode;
}) {
  return (
    <div className={cn('rounded border bg-background px-2 py-1.5', active && 'ring-1 ring-info/50')}>
      <div className="flex items-center gap-1.5">
        <span className={tone}>{icon}</span>
        <span className="text-[11px] font-medium">{title}</span>
        {active && <Loader2 className="ml-auto h-3 w-3 animate-spin text-info" />}
      </div>
      {children && <div className="mt-1 space-y-1">{children}</div>}
    </div>
  );
}

function PlanningCard({ round }: { round: AgentRoundState }) {
  const { t } = useI18n();
  const sys = useSystemText();
  const active = round.activePhase === 'planning';
  const results = round.review?.acceptanceResults ?? [];
  return (
    <LaneShell icon={<ClipboardList className="h-3.5 w-3.5" />} title={t('agents.planning.title')} active={active} tone="text-violet-500">
      {round.subtask ? (
        <>
          <p className="text-xs font-medium">{sys(round.subtask.title)}</p>
          <p className="whitespace-pre-wrap text-[11px] leading-snug text-muted-foreground">{sys(round.subtask.brief)}</p>
          <ul className="space-y-0.5">
            {round.subtask.acceptance.map((item, i) => (
              <AcceptanceItem key={i} text={sys(item)} result={results[i]} index={i} />
            ))}
          </ul>
        </>
      ) : active ? (
        <p className="text-[11px] text-muted-foreground">{t('agents.phase.planning')}…</p>
      ) : null}
    </LaneShell>
  );
}

function AcceptanceItem({
  text,
  result,
  index,
}: {
  text: string;
  result: { passed: boolean; note: string } | undefined;
  index: number;
}) {
  const { t } = useI18n();
  if (!result) {
    return (
      <li className="flex items-start gap-1 text-[11px] text-muted-foreground">
        <span className="mt-0.5 text-slate-400">•</span>
        {text}
      </li>
    );
  }
  return (
    <li className="flex items-start gap-1 text-[11px]">
      {result.passed ? (
        <Check className="mt-0.5 h-3 w-3 shrink-0 text-success" />
      ) : (
        <X className="mt-0.5 h-3 w-3 shrink-0 text-destructive" />
      )}
      <span>
        <span className="text-muted-foreground">{text}</span>
        <span className="ml-1 text-[10px] text-muted-foreground/70">
          {result.passed ? t('agents.review.passed') : t('agents.review.failed')}
          {result.note ? `：${result.note}` : ''}
        </span>
      </span>
      <span className="sr-only">{index}</span>
    </li>
  );
}

function ExecutionCard({ round }: { round: AgentRoundState }) {
  const { t } = useI18n();
  const sys = useSystemText();
  const active = round.activePhase === 'executing';
  const o = round.outcome;
  const empty = !o || (o.toolCalls.length === 0 && o.evidence.length === 0);
  return (
    <LaneShell icon={<Hammer className="h-3.5 w-3.5" />} title={t('agents.execution.title')} active={active} tone="text-teal-500">
      {o ? (
        <>
          {o.toolCalls.length > 0 && (
            <div>
              <p className="text-[10px] text-muted-foreground">{t('agents.execution.tools')}</p>
              <div className="mt-0.5 flex flex-wrap gap-1">
                {o.toolCalls.map((tool) => (
                  <Badge key={tool} variant="outline" className="px-1.5 py-0 text-[10px] font-mono">{tool}</Badge>
                ))}
              </div>
            </div>
          )}
          {o.evidence.length > 0 && <EvidenceList evidence={o.evidence} />}
          {empty && <p className="text-[11px] text-muted-foreground">{t('agents.execution.none')}</p>}
          {o.unfinished.length > 0 && (
            <div className="rounded bg-warning/10 p-1">
              <p className="flex items-center gap-1 text-[10px] font-medium text-warning">
                <TriangleAlert className="h-3 w-3" />
                {t('agents.execution.unfinished')}
              </p>
              <ul className="mt-0.5 list-disc pl-4 text-[11px] text-warning/90">
                {o.unfinished.map((u, i) => <li key={i}>{sys(u)}</li>)}
              </ul>
            </div>
          )}
        </>
      ) : active ? (
        <p className="text-[11px] text-muted-foreground">{t('agents.phase.executing')}…</p>
      ) : null}
    </LaneShell>
  );
}

export function EvidenceList({ evidence }: { evidence: Citation[] }) {
  const { t } = useI18n();
  return (
    <div>
      <p className="text-[10px] text-muted-foreground">{t('agents.execution.evidence')}</p>
      <ul className="mt-0.5 space-y-0.5">
        {evidence.map((c, i) => (
          <li key={`${c.documentId}-${c.ordinal}-${i}`} className="flex items-start gap-1 text-[11px]">
            <FileText className="mt-0.5 h-3 w-3 shrink-0 text-sky-500" />
            <span className="min-w-0">
              <span className="font-medium">[{c.ordinal}] {c.documentName}</span>
              {c.pageNo ? <span className="text-muted-foreground"> · p.{c.pageNo}</span> : null}
              {c.snippet && <span className="block truncate text-muted-foreground/80" title={c.snippet}>{c.snippet}</span>}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

const VERDICT_STYLE: Record<ReviewVerdict, { variant: 'success' | 'warning' | 'danger'; key: MessageKey }> = {
  approve: { variant: 'success', key: 'agents.review.approve' },
  revise: { variant: 'warning', key: 'agents.review.revise' },
  reject: { variant: 'danger', key: 'agents.review.reject' },
};

function ReviewCard({ round }: { round: AgentRoundState }) {
  const { t } = useI18n();
  const sys = useSystemText();
  const active = round.activePhase === 'reviewing';
  const review = round.review;
  return (
    <LaneShell icon={<ShieldCheck className="h-3.5 w-3.5" />} title={t('agents.review.title')} active={active} tone="text-pink-500">
      {review ? (
        <>
          <Badge variant={VERDICT_STYLE[review.verdict].variant} className="px-1.5 py-0 text-[10px]">
            {t(VERDICT_STYLE[review.verdict].key)}
          </Badge>
          {review.reviewNotes && (
            <p className="whitespace-pre-wrap text-[11px] leading-snug text-muted-foreground">{sys(review.reviewNotes)}</p>
          )}
        </>
      ) : active ? (
        <p className="text-[11px] text-muted-foreground">{t('agents.review.awaiting')}</p>
      ) : null}
    </LaneShell>
  );
}
