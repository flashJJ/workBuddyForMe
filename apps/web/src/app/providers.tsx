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
              <HydrationMarker />
              {children}
            </ConfirmProvider>
          </ToastProvider>
        </I18nProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}
