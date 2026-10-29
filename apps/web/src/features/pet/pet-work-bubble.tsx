'use client';

import * as React from 'react';
import type { PetWorkBase, PetWorkView } from '@wbfm/shared';
import { useI18n } from '@/lib/i18n/use-i18n';

export type WorkBubbleMode = 'auto' | 'always' | 'hidden';

const DOT: Record<PetWorkBase, string> = {
  idle: 'bg-muted-foreground/50',
  thinking: 'bg-primary',
  working: 'bg-primary',
  waiting: 'bg-amber-500',
  success: 'bg-emerald-500',
  error: 'bg-destructive',
  disconnected: 'bg-muted-foreground',
};

/** 气泡是否可见（PetStage 据此决定字幕下移） */
export function isWorkBubbleVisible(
  view: PetWorkView,
  mode: WorkBubbleMode,
  enabled: boolean,
  connected: boolean,
): boolean {
  if (!enabled || mode === 'hidden') return false;
  if (!connected) return true;
  if (mode === 'always') return true;
  return view.base !== 'idle' || view.approvalCount > 0 || view.pulse !== null;
}

interface Props {
  view: PetWorkView;
  mode: WorkBubbleMode;
  enabled: boolean;
  connected: boolean;
  reduceMotion: boolean;
}

/**
 * v2.7 桌宠工作气泡：只读展示，不接收指针（保持点击穿透）。
 * 双击头部可用当前主运行深链回主窗。
 */
export function PetWorkBubble({ view, mode, enabled, connected, reduceMotion }: Props) {
  const { t } = useI18n();
  if (!isWorkBubbleVisible(view, mode, enabled, connected)) return null;

  const primary = view.primary;
  const sourceLabel = primary
    ? primary.source === 'task'
      ? t('pet.work.sourceTask')
      : primary.source === 'flow'
        ? t('pet.work.sourceFlow')
        : primary.source === 'subagent'
          ? t('pet.work.sourceSubagent')
          : t('pet.work.sourceAgent')
    : null;

  let headline: string;
  if (!connected) headline = t('pet.work.disconnected');
  else if (view.approvalCount > 0) {
    headline = primary
      ? t('pet.work.headlineApproval', { title: primary.title })
      : t('pet.work.approvalOnly', { count: view.approvalCount });
  } else if (view.base === 'error') {
    headline = t('pet.work.headlineError', { title: primary?.title ?? '' });
  } else if (view.base === 'success') {
    headline = t('pet.work.headlineSuccess', { title: primary?.title ?? '' });
  } else if (primary) {
    headline = primary.stepLabel ? `${primary.title} · ${primary.stepLabel}` : primary.title;
  } else {
    headline = t('pet.work.idle');
  }

  const pulse = view.pulse !== null && !reduceMotion;

  return (
    <div className="pointer-events-none absolute inset-x-0 top-[2%] flex justify-center px-3">
      <div
        className={`max-w-[92%] rounded-xl border border-border/60 bg-background/88 px-3 py-1.5 text-center shadow-sm backdrop-blur-sm ${
          pulse ? 'animate-pulse' : ''
        }`}
        data-testid="pet-work-bubble"
        data-work-state={view.base}
        data-work-approvals={view.approvalCount}
      >
        <div className="flex items-center justify-center gap-1.5 text-xs font-medium text-foreground">
          <span className={`h-1.5 w-1.5 rounded-full ${DOT[view.base]}`} aria-hidden />
          {sourceLabel && (
            <span className="rounded bg-muted px-1 py-0.5 text-[10px] text-muted-foreground">
              {sourceLabel}
            </span>
          )}
          <span className="line-clamp-2">{headline}</span>
        </div>
        {(view.runningCount > 0 || view.approvalCount > 0) && (
          <div className="mt-0.5 flex items-center justify-center gap-2 text-[10px] text-muted-foreground">
            {view.runningCount > 0 && (
              <span>{t('pet.work.running', { count: view.runningCount })}</span>
            )}
            {view.approvalCount > 0 && (
              <span className="font-medium text-amber-600 dark:text-amber-400">
                {t('pet.work.approvals', { count: view.approvalCount })}
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
