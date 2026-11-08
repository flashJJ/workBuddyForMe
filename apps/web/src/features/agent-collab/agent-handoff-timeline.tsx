'use client';

import { ArrowRight, GitBranch } from 'lucide-react';
import type { AgentRole, ReviewVerdict } from '@wbfm/shared/schemas';
import type { MessageKey } from '@wbfm/shared/i18n';
import { Badge } from '@/components/ui/badge';
import { useI18n } from '@/lib/i18n/use-i18n';
import { useSystemText } from '@/lib/i18n/use-system-text';
import type { AgentHandoffEntry } from './agent-run-reducer';

/**
 * v2.27 M5：协作卡交接泳道时间线——按服务端 seq 展示「谁交给谁、距上次交接耗时、结论摘要」。
 * 数据来自 v1.4 已有 handoff 帧/回放，不新增接口；空交接不渲染。
 */

const ROLE_KEY: Record<AgentRole | 'user', MessageKey> = {
  planner: 'agents.role.planner',
  executor: 'agents.role.executor',
  reviewer: 'agents.role.reviewer',
  user: 'agents.role.user',
};

const VERDICT_STYLE: Record<ReviewVerdict, { variant: 'success' | 'warning' | 'danger'; key: MessageKey }> = {
  approve: { variant: 'success', key: 'agents.review.approve' },
  revise: { variant: 'warning', key: 'agents.review.revise' },
  reject: { variant: 'danger', key: 'agents.review.reject' },
};

/** 相邻交接耗时：秒级保留 1 位小数，分钟级带分秒 */
function formatDelta(ms: number): string {
  if (ms < 1000) return `${Math.max(0, Math.round(ms))}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(ms < 10_000 ? 1 : 0)}s`;
  return `${Math.floor(ms / 60_000)}m ${Math.round((ms % 60_000) / 1000)}s`;
}

export function AgentHandoffTimeline({ handoffs }: { handoffs: AgentHandoffEntry[] }) {
  const { t } = useI18n();
  if (handoffs.length === 0) return null;
  return (
    <section
      className="min-w-0 rounded-md border bg-muted/10 px-2 py-1.5"
      data-testid="agent-handoff-timeline"
    >
      <p className="flex items-center gap-1 text-[10px] font-semibold text-muted-foreground">
        <GitBranch className="h-3 w-3 shrink-0" />
        {t('agents.handoff.title')}
      </p>
      <ol className="mt-1 space-y-1.5">
        {handoffs.map((handoff, index) => (
          <HandoffRow
            key={`${handoff.round}-${handoff.seq}`}
            handoff={handoff}
            previousAt={index > 0 ? handoffs[index - 1]!.at : null}
          />
        ))}
      </ol>
    </section>
  );
}

function HandoffRow({ handoff, previousAt }: { handoff: AgentHandoffEntry; previousAt: string | null }) {
  const { t } = useI18n();
  const sys = useSystemText();
  const delta = previousAt ? Date.parse(handoff.at) - Date.parse(previousAt) : Number.NaN;
  const duration = Number.isFinite(delta) ? formatDelta(delta) : '';
  return (
    <li className="min-w-0" data-testid="agent-handoff-item" data-kind={handoff.kind}>
      <div className="flex flex-wrap items-center gap-1 text-[11px]">
        <Badge variant="outline" className="px-1.5 py-0 text-[10px]">
          {t(ROLE_KEY[handoff.from])}
        </Badge>
        <ArrowRight className="h-3 w-3 shrink-0 text-muted-foreground" />
        <Badge variant="outline" className="px-1.5 py-0 text-[10px]">
          {t(ROLE_KEY[handoff.to])}
        </Badge>
        {duration && (
          <span
            className="font-mono text-[10px] text-muted-foreground"
            title={t('agents.handoff.durationTitle', { duration })}
          >
            +{duration}
          </span>
        )}
        {handoff.verdict && (
          <Badge
            variant={VERDICT_STYLE[handoff.verdict].variant}
            className="px-1.5 py-0 text-[10px]"
          >
            {t(VERDICT_STYLE[handoff.verdict].key)}
          </Badge>
        )}
        <span className="ml-auto shrink-0 text-[10px] text-muted-foreground/70">
          {t('agents.round.label', { round: handoff.round + 1 })}
        </span>
      </div>
      {handoff.summary && (
        <p
          className="mt-0.5 line-clamp-2 break-words text-[11px] leading-snug text-muted-foreground"
          title={sys(handoff.summary)}
        >
          {sys(handoff.summary)}
        </p>
      )}
    </li>
  );
}
