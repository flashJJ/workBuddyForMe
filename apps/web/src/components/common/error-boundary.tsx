'use client';

import * as React from 'react';
import { AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface ErrorBoundaryProps {
  children: React.ReactNode;
  /** 自定义兜底渲染；不传使用默认面板 */
  fallback?: React.ReactNode;
  onReset?: () => void;
}

interface ErrorBoundaryState {
  error: Error | null;
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
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 p-8 text-center">
        <AlertTriangle className="h-10 w-10 text-destructive" />
        <div>
          <p className="text-base font-semibold">页面出了点问题</p>
          <p className="mt-1 max-w-md text-sm text-muted-foreground">
            {this.state.error.message || '发生未知渲染错误'}
          </p>
        </div>
        <Button variant="outline" onClick={this.reset}>
          重试
        </Button>
      </div>
    );
  }
}
