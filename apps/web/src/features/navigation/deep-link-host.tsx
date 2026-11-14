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
      if (!path.startsWith('/')) return;
      router.push(path);
      const hash = path.includes('#') ? path.slice(path.indexOf('#') + 1) : '';
      if (!hash) return;
      // 同页 router.push 带 hash 不一定触发 hashchange：补发一次，让设置页滚动到目标面板
      window.setTimeout(() => {
        if (window.location.hash === `#${hash}`) window.dispatchEvent(new Event('hashchange'));
        else window.location.hash = hash;
      }, 0);
    });
  }, [router]);
  return null;
}
