'use client';

import * as React from 'react';
import { apiGet, apiPut } from '@/lib/api/client';
import { API } from '@/lib/api/endpoints';
import type { AppSettings } from '@wbfm/shared/types';

/** 用户主题偏好（v1.2 起含 system） */
export type ThemePreference = 'light' | 'dark' | 'system';
/** system 解析后的实际主题 */
export type ResolvedTheme = 'light' | 'dark';

export const THEME_STORAGE_KEY = 'wbfm-theme';
const SYSTEM_QUERY = '(prefers-color-scheme: dark)';

interface ThemeContextValue {
  /** 用户选择的偏好（可能是 system） */
  theme: ThemePreference;
  /** 实际生效主题（system 已解析） */
  resolvedTheme: ResolvedTheme;
  setTheme: (theme: ThemePreference) => void;
  /** 在 light/dark 间切换；当前为 system 时按实际生效值反向切到具体主题 */
  toggleTheme: () => void;
}

const ThemeContext = React.createContext<ThemeContextValue | null>(null);

function resolveTheme(theme: ThemePreference): ResolvedTheme {
  if (theme === 'system') {
    return typeof window !== 'undefined' && window.matchMedia(SYSTEM_QUERY).matches
      ? 'dark'
      : 'light';
  }
  return theme;
}

function applyTheme(theme: ThemePreference): ResolvedTheme {
  const resolved = resolveTheme(theme);
  if (typeof document !== 'undefined') {
    document.documentElement.classList.toggle('dark', resolved === 'dark');
  }
  return resolved;
}

/**
 * 在页面最早执行，避免深色模式闪烁。
 * 读 localStorage 缓存（含 system 态的 matchMedia 解析）；水合前就按上次偏好渲染。
 */
export const themeInitScript = `(function(){try{var t=localStorage.getItem('${THEME_STORAGE_KEY}')||'light';var d=t==='dark'||(t==='system'&&window.matchMedia('${SYSTEM_QUERY}').matches);if(d)document.documentElement.classList.add('dark');}catch(e){}})();`;

export function ThemeProvider({
  children,
  /** 测试用：跳过服务端设置水合（避免额外 fetch 污染调用断言），仅用 localStorage */
  skipHydration = false,
}: {
  children: React.ReactNode;
  skipHydration?: boolean;
}) {
  const [theme, setThemeState] = React.useState<ThemePreference>('light');
  const [resolvedTheme, setResolvedTheme] = React.useState<ResolvedTheme>('light');

  // 首屏：先按 localStorage 缓存应用（与内联脚本一致），避免水合前空窗
  React.useEffect(() => {
    const stored = (localStorage.getItem(THEME_STORAGE_KEY) as ThemePreference | null) ?? 'light';
    setThemeState(stored);
    setResolvedTheme(applyTheme(stored));
  }, []);

  // 水合：以服务端设置为真源校正，并回写缓存；失败（如纯 web 无后端早期）静默用缓存
  React.useEffect(() => {
    if (skipHydration) return;
    let cancelled = false;
    void apiGet<AppSettings>(API.settings)
      .then((settings) => {
        if (cancelled) return;
        setThemeState(settings.theme);
        localStorage.setItem(THEME_STORAGE_KEY, settings.theme);
        setResolvedTheme(applyTheme(settings.theme));
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [skipHydration]);

  // system 跟随系统变化
  React.useEffect(() => {
    if (theme !== 'system') return;
    const mql = window.matchMedia(SYSTEM_QUERY);
    const onChange = () => setResolvedTheme(applyTheme('system'));
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, [theme]);

  const setTheme = React.useCallback((next: ThemePreference) => {
    const previous = localStorage.getItem(THEME_STORAGE_KEY) as ThemePreference | null;
    // 乐观更新：立即换肤+落缓存
    setThemeState(next);
    localStorage.setItem(THEME_STORAGE_KEY, next);
    setResolvedTheme(applyTheme(next));
    // 持久化到设置表（单一真源）；失败回滚，避免两入口长期分裂
    void apiPut<AppSettings>(API.settings, { theme: next }).catch(() => {
      if (previous) {
        setThemeState(previous);
        localStorage.setItem(THEME_STORAGE_KEY, previous);
        setResolvedTheme(applyTheme(previous));
      }
    });
  }, []);

  const toggleTheme = React.useCallback(() => {
    setTheme(resolvedTheme === 'dark' ? 'light' : 'dark');
  }, [resolvedTheme, setTheme]);

  const value = React.useMemo(
    () => ({ theme, resolvedTheme, setTheme, toggleTheme }),
    [theme, resolvedTheme, setTheme, toggleTheme],
  );
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const ctx = React.useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme 必须在 ThemeProvider 内使用');
  return ctx;
}
