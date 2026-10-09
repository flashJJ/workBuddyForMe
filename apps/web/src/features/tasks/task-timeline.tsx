'use client';

import * as React from 'react';
import type { TaskStepView } from '@wbfm/shared/schemas';
import { AttachmentImage } from '@/features/chat/attachment-image';
import { useI18n } from '@/lib/i18n/use-i18n';
import { useIntl } from '@/lib/i18n/use-intl';
import { TaskStepStatusBadge } from './task-status-badge';

/**
 * 任务步骤时间线：按 stepIndex 升序渲染每个步骤为一张卡片。
 * 观察步的截图缩略图（attachments 路径）+ 动作理由 + 工具参数 + 结果/错误 + 时延。
 */
export function TaskTimeline({ steps }: { steps: TaskStepView[] }) {
  const { t } = useI18n();
  const intl = useIntl();
  if (steps.length === 0) {
    return <p className="text-sm text-muted-foreground">{t('tasks.timeline.empty')}</p>;
  }
  return (
    <ol className="space-y-3">
      {steps.map((step) => (
        <li
          key={step.id}
          className="rounded-md border bg-card p-3"
          data-testid={`task-step-${step.stepIndex}`}
        >
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-mono text-muted-foreground">#{step.stepIndex}</span>
            <TaskStepStatusBadge kind={step.kind} status={step.status} />
          </div>
          {step.toolName && (
            <p className="mt-1 text-sm font-medium">
              {t('tasks.timeline.tool')}
              <span className="font-mono text-xs">{step.toolName}</span>
            </p>
          )}
          {step.reason && (
            <p className="mt-1 text-xs text-muted-foreground">
              {t('tasks.timeline.reason', { text: step.reason })}
            </p>
          )}
          {step.argsJson && (
            <details className="mt-2">
              <summary className="cursor-pointer text-xs text-muted-foreground">
                {t('tasks.timeline.args')}
              </summary>
              <pre className="mt-1 max-h-40 overflow-auto rounded bg-muted/50 p-2 text-xs">{step.argsJson}</pre>
            </details>
          )}
          {step.resultJson && (
            <details className="mt-1">
              <summary className="cursor-pointer text-xs text-muted-foreground">
                {t('tasks.timeline.result')}
              </summary>
              <pre className="mt-1 max-h-40 overflow-auto rounded bg-muted/50 p-2 text-xs">{step.resultJson}</pre>
            </details>
          )}
          {step.error && (
            <p className="mt-2 rounded bg-destructive/10 p-2 text-xs text-destructive">
              {t('tasks.timeline.error', { error: step.error })}
            </p>
          )}
          {step.screenshotPath && (
            <div className="mt-2">
              <AttachmentImage attachmentId={step.screenshotPath} />
            </div>
          )}
          <p className="mt-2 text-[10px] text-muted-foreground">
            {t('tasks.timeline.duration', { ms: step.durationMs })} ·{' '}
            {intl.formatTime(step.createdAt, {
              hour: '2-digit',
              minute: '2-digit',
              second: '2-digit',
            })}
          </p>
        </li>
      ))}
    </ol>
  );
}
