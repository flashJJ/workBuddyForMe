'use client';

import * as React from 'react';
import type { PermissionLevel } from '@wbfm/shared/types';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';

interface Props {
  open: boolean;
  tool: string;
  permission: PermissionLevel;
  argsSummary: string;
  submitting: boolean;
  /** v0.7 M2：是否存在任务作用域（对话已建立），决定「本任务内允许」按钮可用性 */
  taskScopeAvailable: boolean;
  onOpenChange: (open: boolean) => void;
  /** 用户点击拒绝 / 本次允许 / 本任务内允许 / 一直允许；返回 false 时保持弹窗 */
  onSubmit: (action: 'allow' | 'deny', remember?: 'assistant' | 'all' | 'task') => Promise<boolean>;
}

function permissionBadge(permission: PermissionLevel): { variant: 'warning' | 'danger'; label: string } {
  switch (permission) {
    case 'write':
      return { variant: 'warning', label: '写入' };
    case 'danger':
      return { variant: 'danger', label: '高危' };
    default:
      return { variant: 'warning', label: permission };
  }
}

export function ToolConfirmDialog({ open, tool, permission, argsSummary, submitting, taskScopeAvailable, onOpenChange, onSubmit }: Props) {
  const pb = permissionBadge(permission);

  const handleDeny = async () => {
    await onSubmit('deny');
    // deny 不弹 toast，直接关闭；若失败则保持打开
  };

  const handleAllowOnce = async () => {
    await onSubmit('allow');
  };

  const handleAllowTask = async () => {
    await onSubmit('allow', 'task');
  };

  const handleAllowAlways = async () => {
    await onSubmit('allow', 'assistant');
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v && !submitting) onOpenChange(false); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            工具执行确认
            <Badge variant={pb.variant}>{pb.label}</Badge>
          </DialogTitle>
          <DialogDescription>
            助手请求执行以下工具调用，是否授权？
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="rounded-md bg-muted p-3 text-sm font-mono break-all">{tool}</div>
          {argsSummary && (
            <div className="text-sm text-muted-foreground space-y-1">
              <div className="text-xs font-medium text-foreground">调用参数摘要：</div>
              <div className="rounded-md bg-muted/60 p-2 break-all">{argsSummary}</div>
            </div>
          )}
        </div>
        <DialogFooter className="flex-col gap-2 sm:flex-row sm:justify-end">
          <Button type="button" variant="outline" className="w-full sm:w-auto" onClick={handleDeny} disabled={submitting}>
            拒绝
          </Button>
          <Button type="button" variant="secondary" className="w-full sm:w-auto" onClick={handleAllowOnce} disabled={submitting}>
            本次允许
          </Button>
          <Button
            type="button"
            variant="secondary"
            className="w-full sm:w-auto"
            onClick={handleAllowTask}
            disabled={submitting || !taskScopeAvailable}
            title={taskScopeAvailable ? '本对话内该工具后续调用不再询问' : '对话建立后可用'}
          >
            本任务内允许
          </Button>
          <Button type="button" className="w-full sm:w-auto" onClick={handleAllowAlways} disabled={submitting}>
            一直允许
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
