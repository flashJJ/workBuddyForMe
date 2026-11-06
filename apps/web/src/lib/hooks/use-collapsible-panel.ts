'use client';

import * as React from 'react';

/**
 * v2.23 可收起侧栏的持久化状态。
 *
 * 用户手动收起/展开后写入 localStorage；从未手动操作过时，
 * 由 `resolveDefault` 决定初始态（如窄窗口默认收起，把宽度让给正文）。
 * 会话列与形象栏共用本 hook，保证两处收起语义一致。
 */
export function useCollapsiblePanel(key: string, resolveDefault?: () => boolean) {
  const [collapsed, setCollapsed] = React.useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    try {
      const stored = window.localStorage.getItem(key);
      if (stored === '1') return true;
      if (stored === '0') return false;
    } catch {
      // 隐私模式下 localStorage 不可读，退回默认值
    }
    return resolveDefault?.() ?? false;
  });

  const toggle = React.useCallback(() => {
    setCollapsed((prev) => {
      const next = !prev;
      try {
        window.localStorage.setItem(key, next ? '1' : '0');
      } catch {
        // 不可写时仅本会话生效
      }
      return next;
    });
  }, [key]);

  return { collapsed, toggle };
}
