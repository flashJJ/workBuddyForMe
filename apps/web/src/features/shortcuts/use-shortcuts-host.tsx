'use client';

import * as React from 'react';
import { ShortcutsOverlay } from './shortcuts-overlay';

/**
 * 快捷键浮层容器（v1.2 M5）：
 * - window keydown Ctrl+/（Web 与 Electron 窗口聚焦时）
 * - Electron preload shortcuts.onOpen（全局快捷键，窗口未聚焦也可唤起）
 * 供命令面板式的非 React 触发（About 面板按钮）通过 window CustomEvent 打开：
 *   window.dispatchEvent(new CustomEvent('shortcuts:open'))
 */
export const SHORTCUTS_OPEN_EVENT = 'shortcuts:open';

export function ShortcutsHost() {
  const [open, setOpen] = React.useState(false);

  React.useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && (e.key === '/' || e.code === 'Slash')) {
        e.preventDefault();
        setOpen((prev) => !prev);
      }
    };
    const onOpenEvent = () => setOpen(true);
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener(SHORTCUTS_OPEN_EVENT, onOpenEvent);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener(SHORTCUTS_OPEN_EVENT, onOpenEvent);
    };
  }, []);

  // Electron 全局快捷键
  React.useEffect(() => {
    const bridge = typeof window !== 'undefined' ? window.wbfm?.shortcuts : undefined;
    if (!bridge) return;
    return bridge.onOpen(() => setOpen(true));
  }, []);

  return <ShortcutsOverlay open={open} onOpenChange={setOpen} />;
}

/** 非容器组件（About 面板按钮等）命令式打开快捷键浮层 */
export function openShortcutsOverlay(): void {
  window.dispatchEvent(new CustomEvent(SHORTCUTS_OPEN_EVENT));
}
