'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';

/**
 * v2.7：接收主进程中继的站内深链（桌宠双击/审批通知），走 App Router 跳转。
 * 纯浏览器无 preload 时为 no-op。
 */
export function DeepLinkHost() {
  const router = useRouter();
  React.useEffect(() => {
    const bridge = window.wbfm?.appLinks;
    if (!bridge) return;
    return bridge.onOpen((path) => {
      if (path.startsWith('/')) router.push(path);
    });
  }, [router]);
  return null;
}
