'use client';

import * as React from 'react';
import type { TaskStepView } from '@wbfm/shared';
import { AttachmentImage } from '@/features/chat/attachment-image';
import { TaskStepStatusBadge } from './task-status-badge';

/**
 * 任务步骤时间线：按 stepIndex 升序渲染每个步骤为一张卡片。
 * 观察步的截图缩略图（attachments 路径）+ 动作理由 + 工具参数 + 结果/错误 + 时延。
 */
export function TaskTimeline({ steps }: { steps: TaskStepView[] }) {
  if (steps.length === 0) {
    return <p className="text-sm text-muted-foreground">暂无步骤记录。</p>;
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
              工具：<span className="font-mono text-xs">{step.toolName}</span>
            </p>
          )}
          {step.reason && <p className="mt-1 text-xs text-muted-foreground">理由：{step.reason}</p>}
          {step.argsJson && (
            <details className="mt-2">
              <summary className="cursor-pointer text-xs text-muted-foreground">参数</summary>
              <pre className="mt-1 max-h-40 overflow-auto rounded bg-muted/50 p-2 text-xs">{step.argsJson}</pre>
            </details>
          )}
          {step.resultJson && (
            <details className="mt-1">
              <summary className="cursor-pointer text-xs text-muted-foreground">结果</summary>
              <pre className="mt-1 max-h-40 overflow-auto rounded bg-muted/50 p-2 text-xs">{step.resultJson}</pre>
            </details>
          )}
          {step.error && (
            <p className="mt-2 rounded bg-red-500/10 p-2 text-xs text-red-600 dark:text-red-400">
              错误：{step.error}
            </p>
          )}
          {step.screenshotPath && (
            <div className="mt-2">
              <AttachmentImage attachmentId={step.screenshotPath} />
            </div>
          )}
          <p className="mt-2 text-[10px] text-muted-foreground">
            耗时 {step.durationMs}ms · {new Date(step.createdAt).toLocaleTimeString()}
          </p>
        </li>
      ))}
    </ol>
  );
}
