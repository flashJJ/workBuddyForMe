'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { CommandPalette } from './command-palette';

/**
 * 命令面板容器组件（M5）：
 * - 管理 open 状态
 * - 监听 window keydown Ctrl+K（窗口聚焦时切换）
 * - 监听 Electron preload 的 commandPalette.onOpen（全局快捷键触发）
 * - 提供 navigate 给命令执行用
 */
export function CommandPaletteHost() {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);

  const navigate = React.useCallback(
    (href: string) => {
      setOpen(false);
      router.push(href);
    },
    [router],
  );

  // window 键盘监听（Web 模式 + Electron 窗口聚焦时）
  React.useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen((prev) => !prev);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  // Electron 全局快捷键（窗口未聚焦时也能唤起）
  React.useEffect(() => {
    const bridge = typeof window !== 'undefined' ? window.wbfm?.commandPalette : undefined;
    if (!bridge) return;
    const off = bridge.onOpen(() => setOpen(true));
    return off;
  }, []);

  return <CommandPalette open={open} onOpenChange={setOpen} navigate={navigate} />;
}
