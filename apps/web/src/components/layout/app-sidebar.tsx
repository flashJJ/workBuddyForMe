'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import { ThemeToggle } from '@/components/theme/theme-toggle';
import { NAV_ITEMS } from './nav-config';

/** 应用侧边栏：品牌区 + 模块导航 + 主题切换 */
export function AppSidebar() {
  const pathname = usePathname();

  return (
    <aside className="flex h-full w-56 shrink-0 flex-col border-r bg-card">
      <div className="px-5 py-4">
        <p className="text-base font-semibold tracking-tight">WorkBuddy</p>
        <p className="text-xs text-muted-foreground">私人 AI 平台</p>
      </div>
      <nav className="flex-1 space-y-1 px-3" aria-label="主导航">
        {NAV_ITEMS.map((item) => {
          const active = pathname.startsWith(item.href);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              title={item.description}
              aria-current={active ? 'page' : undefined}
              className={cn(
                'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
                active
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground',
              )}
            >
              <Icon className="h-4 w-4" />
              {item.label}
            </Link>
          );
        })}
      </nav>
      <div className="flex items-center justify-between px-5 py-4 text-xs text-muted-foreground">
        <span>v0.4.0</span>
        <ThemeToggle />
      </div>
    </aside>
  );
}
