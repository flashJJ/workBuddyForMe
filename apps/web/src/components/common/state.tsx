import * as React from 'react';
import { Inbox, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

export function Spinner({ className, label }: { className?: string; label?: string }) {
  return (
    <div className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
      <Loader2 className={cn('h-4 w-4 animate-spin', className)} data-testid="spinner" />
      {label ?? '加载中…'}
    </div>
  );
}

interface EmptyStateProps {
  title: string;
  description?: string;
  action?: React.ReactNode;
  icon?: React.ReactNode;
}

/** 空数据占位，支持传入引导动作（如“去配置模型”按钮） */
export function EmptyState({ title, description, action, icon }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed py-12 text-center">
      <div className="text-muted-foreground">{icon ?? <Inbox className="h-8 w-8" />}</div>
      <div>
        <p className="text-sm font-medium">{title}</p>
        {description ? (
          <p className="mt-1 max-w-sm text-xs text-muted-foreground">{description}</p>
        ) : null}
      </div>
      {action}
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-10 text-center">
      <p className="text-sm font-medium text-destructive">{message}</p>
      {onRetry ? (
        <button type="button" className="text-xs text-primary underline" onClick={onRetry}>
          重试
        </button>
      ) : null}
    </div>
  );
}
