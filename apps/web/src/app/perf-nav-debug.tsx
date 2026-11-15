'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';

/**
 * v4.1 性能短跑：dev-only 路由钩子（window.__perfNav）。
 * 短跑脚本在同一渲染进程内往返 /pet 与 /stage，用于观察资源回收；生产构建不安装。
 */
export function PerfNavDebug(): null {
  const router = useRouter();

  React.useEffect(() => {
    if (process.env.NODE_ENV === 'production') return;
    const host = window as unknown as {
      __perfNav?: { push: (href: string) => void };
    };
    host.__perfNav = { push: (href) => router.push(href) };
    return () => {
      delete host.__perfNav;
    };
  }, [router]);

  return null;
}
