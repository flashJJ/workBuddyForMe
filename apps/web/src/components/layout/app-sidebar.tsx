'use client';

import * as React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { PawPrint } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useI18n } from '@/lib/i18n/use-i18n';
import { getPetBridge } from '@/features/pet/bridge';
import { ThemeToggle } from '@/components/theme/theme-toggle';
import { DemoModeBadge } from './demo-mode-badge';
import { NAV_ITEMS } from './nav-config';

/** 应用侧边栏：品牌区 + 模块导航 + 桌宠入口（桌面端）+ 主题切换 */
export function AppSidebar() {
  const pathname = usePathname();
  const { t } = useI18n();
  // 仅桌面端注入 pet 桥；首帧按 Web 处理，挂载后再显示入口
  const [petReady, setPetReady] = React.useState(false);

  React.useEffect(() => {
    setPetReady(Boolean(getPetBridge()));
  }, []);

  return (
    <aside className="app-glass-surface flex h-full w-14 shrink-0 flex-col border-r bg-ui-card md:w-56">
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
              draggable={false}
              aria-current={active ? 'page' : undefined}
              className={cn(
                'flex items-center justify-center gap-3 rounded-md px-2 py-2 text-sm font-medium transition-colors md:justify-start md:px-3',
                active
                  ? 'bg-primary text-primary-foreground'
                  : 'text-foreground/80 hover:bg-accent hover:text-accent-foreground',
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
        <div className="flex items-center gap-1">
          {petReady ? (
            <button
              type="button"
              className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              title={t('nav.pet.label')}
              aria-label={t('nav.pet.label')}
              data-testid="sidebar-pet-entry"
              onClick={() => void getPetBridge()?.open()}
            >
              <PawPrint className="h-4 w-4" />
            </button>
          ) : null}
          <DemoModeBadge />
          <ThemeToggle />
        </div>
      </div>
    </aside>
  );
}

