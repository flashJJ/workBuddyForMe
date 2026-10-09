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
import { useI18n } from '@/lib/i18n/use-i18n';

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

export function ToolConfirmDialog({ open, tool, permission, argsSummary, submitting, taskScopeAvailable, onOpenChange, onSubmit }: Props) {
  const { t } = useI18n();
  // 未知权限等级回退展示枚举原值（write/danger 走本地化文案）
  const permissionVariant = permission === 'danger' ? 'danger' : 'warning';
  const permissionLabel =
    permission === 'write'
      ? t('chat.toolConfirm.permissionWrite')
      : permission === 'danger'
        ? t('chat.toolConfirm.permissionDanger')
        : permission;

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
            {t('chat.toolConfirm.title')}
            <Badge variant={permissionVariant}>{permissionLabel}</Badge>
          </DialogTitle>
          <DialogDescription>
            {t('chat.toolConfirm.description')}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="rounded-md bg-muted p-3 text-sm font-mono break-all">{tool}</div>
          {argsSummary && (
            <div className="text-sm text-muted-foreground space-y-1">
              <div className="text-xs font-medium text-foreground">{t('chat.toolConfirm.argsSummaryLabel')}</div>
              <div className="rounded-md bg-muted/60 p-2 break-all">{argsSummary}</div>
            </div>
          )}
        </div>
        <DialogFooter className="flex-col gap-2 sm:flex-row sm:justify-end">
          <Button type="button" variant="outline" className="w-full sm:w-auto" onClick={handleDeny} disabled={submitting}>
            {t('chat.toolConfirm.deny')}
          </Button>
          <Button type="button" variant="secondary" className="w-full sm:w-auto" onClick={handleAllowOnce} disabled={submitting}>
            {t('chat.toolConfirm.allowOnce')}
          </Button>
          <Button
            type="button"
            variant="secondary"
            className="w-full sm:w-auto"
            onClick={handleAllowTask}
            disabled={submitting || !taskScopeAvailable}
            title={
              taskScopeAvailable
                ? t('chat.toolConfirm.allowTaskTitle')
                : t('chat.toolConfirm.taskUnavailableTitle')
            }
          >
            {t('chat.toolConfirm.allowTask')}
          </Button>
          <Button type="button" className="w-full sm:w-auto" onClick={handleAllowAlways} disabled={submitting}>
            {t('chat.toolConfirm.allowAlways')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
