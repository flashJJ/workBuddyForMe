'use client';

import * as React from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useI18n } from '@/lib/i18n/use-i18n';

interface Props {
  open: boolean;
  endpoint: string;
  query: string;
  /** 桌面端可自动拉起；浏览器模式仅提示手动启动后重试 */
  canAutoStart: boolean;
  running: boolean;
  error: string | null;
  onStart: () => void;
  onCancel: () => void;
}

/** v4.16：对话中本地 SearXNG 未运行的启动确认框 */
export function LocalSearchStartDialog({
  open,
  endpoint,
  query,
  canAutoStart,
  running,
  error,
  onStart,
  onCancel,
}: Props) {
  const { t } = useI18n();

  return (
    <Dialog open={open} onOpenChange={(value) => { if (!value && !running) onCancel(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t('chat.localSearchStart.title')}</DialogTitle>
          <DialogDescription>
            {t('chat.localSearchStart.description', { endpoint })}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2 text-sm">
          {query && (
            <p className="text-muted-foreground">
              {t('chat.localSearchStart.queryLabel')}：{query}
            </p>
          )}
          {!canAutoStart && (
            <p className="text-muted-foreground">{t('chat.localSearchStart.webHint')}</p>
          )}
          {error && (
            <pre
              className="max-h-40 overflow-auto whitespace-pre-wrap rounded-md bg-destructive/10 p-2 text-xs text-destructive"
              role="alert"
            >
              {error}
            </pre>
          )}
        </div>
        <DialogFooter className="flex-col gap-2 sm:flex-row sm:justify-end">
          <Button type="button" variant="outline" onClick={onCancel} disabled={running}>
            {t('chat.localSearchStart.cancel')}
          </Button>
          <Button type="button" onClick={onStart} disabled={running}>
            {running
              ? t('chat.localSearchStart.starting')
              : canAutoStart
                ? t('chat.localSearchStart.confirm')
                : t('chat.localSearchStart.confirmWeb')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
