'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { useToast } from '@/components/common/toast';
import { useI18n } from '@/lib/i18n/use-i18n';
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
  const toast = useToast();
  const { t } = useI18n();
  const [open, setOpen] = React.useState(false);

  // v4.17：首次使用提示一次 Ctrl+K，避免快捷键只存在于文档
  React.useEffect(() => {
    const KEY = 'wbfm.commandPalette.hinted';
    try {
      if (window.localStorage.getItem(KEY)) return;
      window.localStorage.setItem(KEY, '1');
    } catch {
      return;
    }
    const isMac = navigator.platform.toLowerCase().includes('mac');
    const timer = setTimeout(
      () => toast.info(t('commandPalette.firstUseHint', { shortcut: isMac ? '⌘K' : 'Ctrl+K' })),
      1200,
    );
    return () => clearTimeout(timer);
  }, [toast, t]);

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
