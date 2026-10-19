'use client';

import * as React from 'react';
import { apiGet, apiPut } from '@/lib/api/client';
import { API } from '@/lib/api/endpoints';
import type { AppSettings } from '@wbfm/shared/types';
import { DEFAULT_THEME_ID, type ThemeId } from '@wbfm/shared/constants';
import { resolveThemeMode, type ResolvedMode } from './theme-registry';

/** 用户主题偏好（v1.2 起含 system） */
export type ThemePreference = 'light' | 'dark' | 'system';

export const THEME_STORAGE_KEY = 'wbfm-theme';
/** v1.8 命名主题缓存键（与明暗三态分开存，正交） */
export const THEME_ID_STORAGE_KEY = 'wbfm-theme-id';
const SYSTEM_QUERY = '(prefers-color-scheme: dark)';

interface ThemeContextValue {
  /** 用户选择的明暗偏好（light/dark/system；命名主题下记录其归属模式） */
  theme: ThemePreference;
  /** 实际生效明暗（system 已解析；命名主题按注册表固定） */
  resolvedTheme: ResolvedMode;
  /** v1.8 命名主题 id */
  themeId: ThemeId;
  setTheme: (theme: ThemePreference) => void;
  setThemeId: (themeId: ThemeId) => void;
  /** 在亮/暗间翻转；命名主题下先回到品牌星际蓝再翻转 */
  toggleTheme: () => void;
}

const ThemeContext = React.createContext<ThemeContextValue | null>(null);

/** 应用到 <html>：data-theme 命名主题 + dark class（命名主题固定明暗，stellar 跟随三态） */
function applyTheme(theme: ThemePreference, themeId: ThemeId): ResolvedMode {
  const resolved = resolveThemeMode(themeId, theme);
  if (typeof document !== 'undefined') {
    document.documentElement.dataset.theme = themeId;
    document.documentElement.classList.toggle('dark', resolved === 'dark');
  }
  return resolved;
}

/**
 * 在页面最早执行，避免深色/命名主题首帧闪烁。
 * 读 localStorage 两份缓存（明暗三态 + 命名主题），水合前就按上次偏好渲染。
 */
export const themeInitScript = `(function(){try{var id=localStorage.getItem('${THEME_ID_STORAGE_KEY}')||'${DEFAULT_THEME_ID}';var t=localStorage.getItem('${THEME_STORAGE_KEY}')||'light';var dark=id==='nocturne-gold'?true:(id==='moonwhite'||id==='sakura'?false:(t==='dark'||(t==='system'&&window.matchMedia('${SYSTEM_QUERY}').matches)));document.documentElement.dataset.theme=id;if(dark)document.documentElement.classList.add('dark');}catch(e){}})();`;

export function ThemeProvider({
  children,
  /** 测试用：跳过服务端设置水合（避免额外 fetch 污染调用断言），仅用 localStorage */
  skipHydration = false,
}: {
  children: React.ReactNode;
  skipHydration?: boolean;
}) {
  const [theme, setThemeState] = React.useState<ThemePreference>('light');
  const [themeId, setThemeIdState] = React.useState<ThemeId>(DEFAULT_THEME_ID);
  const [resolvedTheme, setResolvedTheme] = React.useState<ResolvedMode>('light');

  // ref 让乐观回滚/翻转回调始终读到最新值，又不重建回调
  const themeRef = React.useRef(theme);
  themeRef.current = theme;
  const themeIdRef = React.useRef(themeId);
  themeIdRef.current = themeId;
  const resolvedThemeRef = React.useRef(resolvedTheme);
  resolvedThemeRef.current = resolvedTheme;
  /**
   * 用户在初始水合响应返回前就改过主题：以用户意图为准。
   * 慢响应（弱机/CI 高负载）可能在点击之后才回来，若照单校正会把刚切好的主题
   * 回滚成旧值（表现为「点了没反应」）。
   */
  const userOverriddenRef = React.useRef(false);

  // 首屏：先按 localStorage 缓存应用（与内联脚本一致），避免水合前空窗
  React.useEffect(() => {
    const stored = (localStorage.getItem(THEME_STORAGE_KEY) as ThemePreference | null) ?? 'light';
    const storedId = (localStorage.getItem(THEME_ID_STORAGE_KEY) as ThemeId | null) ?? DEFAULT_THEME_ID;
    setThemeState(stored);
    setThemeIdState(storedId);
    setResolvedTheme(applyTheme(stored, storedId));
  }, []);

  // 水合：以服务端设置为真源校正，并回写缓存；失败（如纯 web 无后端早期）静默用缓存
  React.useEffect(() => {
    if (skipHydration) return;
    let cancelled = false;
    void apiGet<AppSettings>(API.settings)
      .then((settings) => {
        // 用户已抢先改过主题：不回灌服务端旧值，避免覆盖用户选择
        if (cancelled || userOverriddenRef.current) return;
        const nextId = settings.themeId ?? DEFAULT_THEME_ID;
        setThemeState(settings.theme);
        setThemeIdState(nextId);
        localStorage.setItem(THEME_STORAGE_KEY, settings.theme);
        localStorage.setItem(THEME_ID_STORAGE_KEY, nextId);
        setResolvedTheme(applyTheme(settings.theme, nextId));
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [skipHydration]);

  // system 跟随系统变化（仅 stellar 三态下生效；命名主题模式固定）
  React.useEffect(() => {
    if (themeId !== DEFAULT_THEME_ID || theme !== 'system') return;
    const mql = window.matchMedia(SYSTEM_QUERY);
    const onChange = () => setResolvedTheme(applyTheme('system', DEFAULT_THEME_ID));
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, [theme, themeId]);

  // 多窗口同步：另一窗口改了主题/命名主题，本窗立即跟随（v1.8）
  React.useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key !== THEME_STORAGE_KEY && e.key !== THEME_ID_STORAGE_KEY) return;
      const next =
        (localStorage.getItem(THEME_STORAGE_KEY) as ThemePreference | null) ?? themeRef.current;
      const nextId =
        (localStorage.getItem(THEME_ID_STORAGE_KEY) as ThemeId | null) ?? themeIdRef.current;
      setThemeState(next);
      setThemeIdState(nextId);
      setResolvedTheme(applyTheme(next, nextId));
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const setTheme = React.useCallback((next: ThemePreference) => {
    userOverriddenRef.current = true;
    const previous = localStorage.getItem(THEME_STORAGE_KEY) as ThemePreference | null;
    setThemeState(next);
    localStorage.setItem(THEME_STORAGE_KEY, next);
    setResolvedTheme(applyTheme(next, themeIdRef.current));
    // 持久化到设置表（单一真源）；失败回滚，避免两入口长期分裂
    void apiPut<AppSettings>(API.settings, { theme: next }).catch(() => {
      if (previous) {
        setThemeState(previous);
        localStorage.setItem(THEME_STORAGE_KEY, previous);
        setResolvedTheme(applyTheme(previous, themeIdRef.current));
      }
    });
  }, []);

  const setThemeId = React.useCallback((nextId: ThemeId) => {
    userOverriddenRef.current = true;
    const previous = localStorage.getItem(THEME_ID_STORAGE_KEY) as ThemeId | null;
    setThemeIdState(nextId);
    localStorage.setItem(THEME_ID_STORAGE_KEY, nextId);
    setResolvedTheme(applyTheme(themeRef.current, nextId));
    void apiPut<AppSettings>(API.settings, { themeId: nextId }).catch(() => {
      if (previous) {
        setThemeIdState(previous);
        localStorage.setItem(THEME_ID_STORAGE_KEY, previous);
        setResolvedTheme(applyTheme(themeRef.current, previous));
      }
    });
  }, []);

  const toggleTheme = React.useCallback(() => {
    // 命名主题下快捷翻转 = 先回品牌星际蓝，再按当前生效明暗取反
    if (themeIdRef.current !== DEFAULT_THEME_ID) {
      setThemeId(DEFAULT_THEME_ID);
    }
    setTheme(resolvedThemeRef.current === 'dark' ? 'light' : 'dark');
  }, [setTheme, setThemeId]);

  const value = React.useMemo(
    () => ({ theme, resolvedTheme, themeId, setTheme, setThemeId, toggleTheme }),
    [theme, resolvedTheme, themeId, setTheme, setThemeId, toggleTheme],
  );
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const ctx = React.useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme 必须在 ThemeProvider 内使用');
  return ctx;
}
