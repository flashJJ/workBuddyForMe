'use client';

import * as React from 'react';
import { isChatMode } from '@wbfm/shared/schemas';
import { useSettings } from '@/lib/hooks/provider';

/**
 * v4.4：主窗口“整屏”背景模式，统一玻璃表面样式的唯一开关。
 *
 * 这里只输出 `data-main-background` 属性；透明度、模糊与适用范围全部收敛在
 * `globals.css` 的 `[data-main-background='window']` 规则里，避免各组件各写一套。
 */
export function MainBackgroundModeProvider({ children }: { children: React.ReactNode }) {
  const { data } = useSettings();
  const windowMode = !isChatMode(data?.background?.main?.mode);
  return (
    <div className="contents" data-main-background={windowMode ? 'window' : 'chat'}>
      {children}
    </div>
  );
}
