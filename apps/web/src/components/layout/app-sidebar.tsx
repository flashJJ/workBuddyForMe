'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import { useI18n } from '@/lib/i18n/use-i18n';
import { ThemeToggle } from '@/components/theme/theme-toggle';
import { DemoModeBadge } from './demo-mode-badge';
import { NAV_ITEMS } from './nav-config';

/** 应用侧边栏：品牌区 + 模块导航 + 主题切换 */
export function AppSidebar() {
  const pathname = usePathname();
  const { t } = useI18n();

  return (
    <aside className="flex h-full w-14 shrink-0 flex-col border-r bg-card md:w-56">
      <div className="px-2 py-4 md:px-5">
        <p className="hidden text-base font-semibold tracking-tight md:block">{t('common.appName')}</p>
        <p className="hidden text-xs text-muted-foreground md:block">{t('common.brandTagline')}</p>
      </div>
      <nav className="flex-1 space-y-1 px-2 md:px-3" aria-label={t('nav.mainNav')}>
        {NAV_ITEMS.map((item) => {
          const active = pathname.startsWith(item.href);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              title={t(item.labelKey)}
              aria-current={active ? 'page' : undefined}
              className={cn(
                'flex items-center justify-center gap-3 rounded-md px-2 py-2 text-sm font-medium transition-colors md:justify-start md:px-3',
                active
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground',
              )}
            >
              <Icon className="h-4 w-4 shrink-0" />
              <span className="hidden md:inline">{t(item.labelKey)}</span>
            </Link>
          );
        })}
      </nav>
      <div className="flex flex-col items-center gap-2 px-2 py-4 text-xs text-muted-foreground md:flex-row md:justify-between md:px-5">
        <span className="hidden md:inline">v{process.env.NEXT_PUBLIC_APP_VERSION}</span>
        <DemoModeBadge />
        <ThemeToggle />
      </div>
    </aside>
  );
}

