'use client';

import * as React from 'react';
import { AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useI18n } from '@/lib/i18n/use-i18n';

interface ErrorBoundaryProps {
  children: React.ReactNode;
  /** 自定义兜底渲染；不传使用默认面板 */
  fallback?: React.ReactNode;
  onReset?: () => void;
}

interface ErrorBoundaryState {
  error: Error | null;
}

/** 默认兜底面板（函数子组件：class 边界无法直接用 hook） */
function ErrorBoundaryFallback({ error, onReset }: { error: Error; onReset: () => void }) {
  const { t } = useI18n();
  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 p-8 text-center">
      <AlertTriangle className="h-10 w-10 text-destructive" />
      <div>
        <p className="text-base font-semibold">{t('common.errorBoundary.title')}</p>
        <p className="mt-1 max-w-md text-sm text-muted-foreground">
          {error.message || t('common.errorBoundary.unknownRenderError')}
        </p>
      </div>
      <Button variant="outline" onClick={onReset}>
        {t('common.actions.retry')}
      </Button>
    </div>
  );
}

/** 模块级错误边界：捕获渲染异常，提供重试，避免整页白屏 */
export class ErrorBoundary extends React.Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  override state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  override componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('[error-boundary]', error, info.componentStack);
  }

  reset = () => {
    this.props.onReset?.();
    this.setState({ error: null });
  };

  override render() {
    if (!this.state.error) return this.props.children;
    if (this.props.fallback) return this.props.fallback;
    return <ErrorBoundaryFallback error={this.state.error} onReset={this.reset} />;
  }
}
