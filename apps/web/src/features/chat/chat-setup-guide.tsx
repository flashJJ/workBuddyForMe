'use client';

import Link from 'next/link';
import { Button } from '@/components/ui/button';

/** 无可用对话模型时的空态引导 */
export function ChatSetupGuide() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
      <p className="text-sm font-medium">还没有可用的对话模型</p>
      <p className="max-w-sm text-xs text-muted-foreground">
        请先在设置中新增供应商、添加对话模型，并将其设为默认模型（或给助手绑定模型）。
      </p>
      <Button asChild>
        <Link href="/settings">前往设置</Link>
      </Button>
    </div>
  );
}
