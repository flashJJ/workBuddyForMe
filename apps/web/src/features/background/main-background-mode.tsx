'use client';

import * as React from 'react';
import { useSettings } from '@/lib/hooks/provider';

const MainBackgroundWindowModeContext = React.createContext(false);

/**
 * v4.4：主窗口“整屏”背景模式。
 *
 * 布局 chrome（侧边栏、页面头部、页内搜索）在这一模式下改为半透明毛玻璃，
 * 让背景层真正铺满窗口；聊天模式仍保持不透明，避免背景干扰正文。
 */
export function MainBackgroundModeProvider({ children }: { children: React.ReactNode }) {
  const { data } = useSettings();
  const windowMode = data?.background?.main?.mode === 'window';
  return (
    <MainBackgroundWindowModeContext.Provider value={windowMode}>
      {children}
    </MainBackgroundWindowModeContext.Provider>
  );
}

export function useMainBackgroundWindowMode(): boolean {
  return React.useContext(MainBackgroundWindowModeContext);
}
