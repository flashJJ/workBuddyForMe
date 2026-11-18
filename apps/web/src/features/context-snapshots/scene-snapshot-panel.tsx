'use client';

import * as React from 'react';
import { ChevronRight, Layers, TriangleAlert } from 'lucide-react';
import type { MessageKey } from '@wbfm/shared/i18n';
import type {
  ContextSceneRole,
  SceneContextSnapshotPayload,
} from '@wbfm/shared/schemas';
import { cn } from '@/lib/utils';
import { useI18n } from '@/lib/i18n/use-i18n';
import {
  latestByScene,
  type SceneSnapshotEntry,
  type SceneSnapshotSummary,
} from './scene-snapshot-events';

const ROLE_KEY: Record<ContextSceneRole, MessageKey> = {
  planner: 'contextInsights.sceneRoles.planner',
  executor: 'contextInsights.sceneRoles.executor',
  reviewer: 'contextInsights.sceneRoles.reviewer',
};

const SCENE_KEY: Record<SceneContextSnapshotPayload['scene'], MessageKey> = {
  chat_turn: 'contextInsights.sceneNames.chat_turn',
  collab_plan: 'contextInsights.sceneNames.collab_plan',
  collab_exec: 'contextInsights.sceneNames.collab_exec',
  collab_review: 'contextInsights.sceneNames.collab_review',
  task_start: 'contextInsights.sceneNames.task_start',
  task_step: 'contextInsights.sceneNames.task_step',
  flow_node: 'contextInsights.sceneNames.flow_node',
};

interface SnapshotRow {
  key: string;
  labelKey: MessageKey;
  entry: SceneSnapshotEntry;
}

function buildRows(summary: SceneSnapshotSummary): SnapshotRow[] {
  // 仅当本次运行的快照全部带角色时才按角色聚合；任务/Flow 混入无角色场景时按场景展示
  const allHaveRole =
    summary.latestByRole.length > 0 &&
    summary.entries.every((entry) => Boolean(entry.value.role));
  if (allHaveRole) {
    return summary.latestByRole.map(({ role, entry }) => ({
      key: `role-${role}`,
      labelKey: ROLE_KEY[role],
      entry,
    }));
  }
  return latestByScene(summary.entries).map(({ scene, entry }) => ({
    key: `scene-${scene}`,
    labelKey: scene === 'task_start' ? 'contextInsights.sceneStart' : SCENE_KEY[scene],
    entry,
  }));
}

function usagePercent(used: number, budget: number): number {
  if (budget <= 0) return 0;
  return Math.min(100, Math.max(0, Math.round((used / budget) * 100)));
}

export function SceneSnapshotPanel({
  summary,
  compact = false,
  defaultOpen,
}: {
  summary: SceneSnapshotSummary;
  /** 协作卡/Flow 使用，减少纵向占位 */
  compact?: boolean;
  /** 缺省折叠；有截断时强制展开 */
  defaultOpen?: boolean;
}) {
  const { t } = useI18n();
  const [open, setOpen] = React.useState(() => Boolean(defaultOpen) || summary.hasTruncated);

  React.useEffect(() => {
    if (summary.hasTruncated) setOpen(true);
  }, [summary.hasTruncated]);

  if (summary.entries.length === 0) return null;

  const rows = buildRows(summary);
  const Icon = summary.hasTruncated ? TriangleAlert : Layers;

  return (
    <section
      className={cn(
        'min-w-0 rounded-md border bg-ui-row',
        compact ? 'p-1.5' : 'p-2.5',
        summary.hasTruncated && 'border-warning/50 bg-warning/5',
      )}
      data-testid="scene-snapshot-panel"
    >
      <button
        type="button"
        className="flex w-full items-center gap-1.5 text-left"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <Icon
          className={cn(
            'h-3.5 w-3.5 shrink-0',
            summary.hasTruncated ? 'text-warning' : 'text-muted-foreground',
          )}
        />
        <span className="text-[11px] font-semibold">{t('contextInsights.sceneTitle')}</span>
        <span className="text-[10px] text-muted-foreground">
          {t('contextInsights.sceneCount', { count: summary.entries.length })}
        </span>
        {summary.hasTruncated ? (
          <span className="rounded bg-warning/15 px-1 text-[10px] font-mono text-warning">
            {summary.truncatedCount}
          </span>
        ) : null}
        <ChevronRight
          className={cn(
            'ml-auto h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform',
            open && 'rotate-90',
          )}
        />
      </button>
      {open ? (
        <div className={cn('space-y-1.5', compact ? 'mt-1' : 'mt-1.5')}>
          {rows.map((row) => (
            <SnapshotRow key={row.key} row={row} compact={compact} />
          ))}
        </div>
      ) : null}
    </section>
  );
}

function SnapshotRow({ row, compact }: { row: SnapshotRow; compact: boolean }) {
  const { t } = useI18n();
  const { value } = row.entry;
  const testId = `scene-snapshot-${value.scene}${value.role ? `-${value.role}` : ''}`;
  return (
    <div
      className={cn('min-w-0 rounded bg-ui-card/60', compact ? 'px-1.5 py-1' : 'px-2 py-1.5')}
      data-testid={testId}
    >
      <div className="flex items-center justify-between gap-2 text-[10px]">
        <span className="truncate font-medium">{t(row.labelKey)}</span>
        <span
          className={cn(
            'shrink-0 font-mono tabular-nums',
            value.truncated ? 'text-warning' : 'text-muted-foreground',
          )}
        >
          {t('contextInsights.sceneUsage', {
            used: value.promptTokens,
            budget: value.budgetTokens,
          })}
        </span>
      </div>
      <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-muted">
        <div
          className={cn('h-full rounded-full', value.truncated ? 'bg-warning' : 'bg-primary')}
          style={{ width: `${usagePercent(value.promptTokens, value.budgetTokens)}%` }}
        />
      </div>
      <div className="mt-1 flex flex-wrap gap-x-2 text-[10px] text-muted-foreground">
        <span>{t('contextInsights.sceneWindow', { value: value.contextWindow })}</span>
        <span>{t('contextInsights.sceneReserve', { value: value.reserveTokens })}</span>
        {typeof value.systemTokens === 'number' && typeof value.inputTokens === 'number' ? (
          <span>
            {t('contextInsights.sceneSystemInput', {
              system: value.systemTokens,
              input: value.inputTokens,
            })}
          </span>
        ) : null}
      </div>
      {value.truncated ? (
        <p className="mt-1 text-[10px] leading-snug text-warning">
          {t('contextInsights.sceneTruncated', {
            dropped: value.droppedMessages,
            truncated: value.truncatedMessages,
          })}{' '}
          {t(
            value.scene === 'flow_node'
              ? 'contextInsights.sceneFlowAdvice'
              : 'contextInsights.sceneAdvice',
          )}
        </p>
      ) : null}
    </div>
  );
}
