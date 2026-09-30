'use client';

import * as React from 'react';
import { Pause, Play, Square } from 'lucide-react';
import type { TaskRunStatus } from '@wbfm/shared';
import { Button } from '@/components/ui/button';

/**
 * 任务控制条：暂停 / 继续 / 终止。
 * 仅在运行中（running/paused）启用；终态禁用所有按钮。
 * 急停热键 Ctrl+Alt+Esc 由 desktop 主进程全局注册，这里只展示提示文案。
 */
export interface TaskControlBarProps {
  status: TaskRunStatus;
  onPause: () => void;
  onResume: () => void;
  onStop: () => void;
  disabled?: boolean;
}

export function TaskControlBar({ status, onPause, onResume, onStop, disabled }: TaskControlBarProps) {
  const isActive = status === 'running' || status === 'paused';
  return (
    <div className="flex items-center gap-2 rounded-md border bg-card p-2">
      <Button
        type="button"
        size="sm"
        variant="outline"
        onClick={onPause}
        disabled={disabled || status !== 'running'}
      >
        <Pause className="h-4 w-4" />
        暂停
      </Button>
      <Button
        type="button"
        size="sm"
        variant="outline"
        onClick={onResume}
        disabled={disabled || status !== 'paused'}
      >
        <Play className="h-4 w-4" />
        继续
      </Button>
      <Button
        type="button"
        size="sm"
        variant="destructive"
        onClick={onStop}
        disabled={disabled || !isActive}
      >
        <Square className="h-4 w-4" />
        终止
      </Button>
      <span className="ml-auto text-xs text-muted-foreground" title="桌面端急停热键">
        急停：Ctrl+Alt+Esc
      </span>
    </div>
  );
}
