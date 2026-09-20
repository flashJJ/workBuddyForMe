'use client';

import { AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';

/** App Router 模块级错误兜底（reset 由 Next 提供） */
export default function MainError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 p-8 text-center">
      <AlertTriangle className="h-10 w-10 text-destructive" />
      <div>
        <p className="text-base font-semibold">页面出了点问题</p>
        <p className="mt-1 max-w-md text-sm text-muted-foreground">
          {error.message || '发生未知错误'}
        </p>
      </div>
      <Button variant="outline" onClick={reset}>
        重试
      </Button>
    </div>
  );
}
