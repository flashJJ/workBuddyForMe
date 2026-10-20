'use client';

import { useState, type ReactNode } from 'react';
import { ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useI18n } from '@/lib/i18n/use-i18n';

interface Props {
  /** 该列表的模板条数（展示在入口标题里） */
  count: number;
  children: ReactNode;
  defaultOpen?: boolean;
  /** 测试前缀；toggle testid = `${testId}-toggle`，展开区 = `${testId}-content` */
  testId: string;
}

/**
 * v2.4 P0-2（M2）· 列表顶部常驻可折叠模板入口（M0 D4）。
 * 默认折叠：空态里已露过一次，之后留一个不打扰的入口。
 */
export function TemplateLauncher({ count, children, defaultOpen = false, testId }: Props) {
  const { t } = useI18n();
  const [open, setOpen] = useState(defaultOpen);

  return (
    <section className="rounded-md border border-dashed" data-testid={testId}>
      <button
        type="button"
        className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs font-medium text-muted-foreground hover:text-foreground"
        aria-expanded={open}
        onClick={() => setOpen((prev) => !prev)}
        data-testid={`${testId}-toggle`}
      >
        <ChevronRight className={cn('h-3.5 w-3.5 shrink-0 transition-transform', open && 'rotate-90')} />
        {t('templates.launcher', { count })}
      </button>
      {open ? (
        <div className="px-3 pb-3" data-testid={`${testId}-content`}>
          {children}
        </div>
      ) : null}
    </section>
  );
}
