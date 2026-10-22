'use client';

import * as React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ThemeProvider } from '@/components/theme/theme-provider';
import { I18nProvider } from '@/lib/i18n/i18n-context';
import { ToastProvider } from '@/components/common/toast';
import { ConfirmProvider } from '@/components/common/confirm-dialog';

/**
 * 整页水合完成标记：根被动 effect 在初始水合提交后触发。
 * 供 e2e 首交互前等待——慢机（CI 高负载）下 SSR 按钮可见时事件可能尚未附着，
 * 过早点击会成为无响应的「死点击」。
 *
 * 必须渲染在 children 之后：被动 effect 按提交顺序执行，标记先挂载会先于
 * OnboardingHost 等子树的监听注册置位，页面变重（CI 生产构建）时 e2e 点击
 * 仍可能落在监听注册前（表现为「按钮点了没反应」）。
 */
function HydrationMarker() {
  React.useEffect(() => {
    document.documentElement.dataset.hydrated = '1';
  }, []);
  return null;
}

/** 全局客户端 Providers：服务端状态（React Query）+ 主题 */
export function AppProviders({ children }: { children: React.ReactNode }) {
  const [queryClient] = React.useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { retry: 1, refetchOnWindowFocus: false, staleTime: 30_000 },
        },
      }),
  );

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <I18nProvider>
          <ToastProvider>
            <ConfirmProvider>
              {children}
              <HydrationMarker />
            </ConfirmProvider>
          </ToastProvider>
        </I18nProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}
