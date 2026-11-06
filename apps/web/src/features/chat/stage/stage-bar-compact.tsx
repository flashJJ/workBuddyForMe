'use client';

import { ChevronDown } from 'lucide-react';
import type { StagePlan } from '@wbfm/shared/types';
import { Button } from '@/components/ui/button';
import { useI18n } from '@/lib/i18n/use-i18n';

interface Props {
  plan: StagePlan;
  activeTitle: string | null;
  onExpand: () => void;
}

/** v2.23 窄屏（<1280px）阶段条：折叠成「N/M · 阶段名」单行，点开还原完整条 */
export function StageBarCompact({ plan, activeTitle, onExpand }: Props) {
  const { t } = useI18n();
  const summary =
    plan.activeStep !== null && activeTitle
      ? `${plan.activeStep + 1}/${plan.steps.length} · ${activeTitle}`
      : t('chat.stagePlan.noActive');

  return (
    <div
      className="flex items-center gap-2 border-b bg-muted/20 px-3 py-1.5"
      data-testid="chat-stage-bar"
      data-compact="true"
      role="group"
      aria-label={t('chat.stagePlan.label')}
    >
      <span className="shrink-0 text-[11px] font-medium text-muted-foreground">
        {t('chat.stagePlan.label')}
      </span>
      <span className="min-w-0 flex-1 truncate text-xs">{summary}</span>
      <Button
        type="button"
        size="sm"
        variant="ghost"
        className="h-7 px-2"
        aria-label={t('chat.stagePlan.expand')}
        title={t('chat.stagePlan.expand')}
        onClick={onExpand}
        data-testid="stage-expand"
      >
        <ChevronDown className="h-4 w-4" />
      </Button>
    </div>
  );
}
