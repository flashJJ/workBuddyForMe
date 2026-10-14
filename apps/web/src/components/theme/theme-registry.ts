/**
 * v1.8 命名主题注册表（web 单例）。
 *
 * 与 globals.css 的 data-theme 色板一一对应：
 * - stellar：品牌默认，明暗跟随用户的 light/dark/system 三态（mode=null）；
 * - 其余三套自带明暗归属，选中即确定整套色板，不再随系统翻转。
 *
 * preview 仅用于设置卡片的迷你色板预览；运行时真实取值以 globals.css 的
 * CSS 变量为准（两处值在 docs/plan/v1.8/01 色板契约中同源冻结）。
 */
import {
  DEFAULT_THEME_ID,
  THEME_IDS,
  type ThemeId,
  type Theme,
} from '@wbfm/shared/constants';

export type ResolvedMode = 'light' | 'dark';

export interface ThemePreview {
  /** 页面底色 */
  background: string;
  /** 卡片底色 */
  card: string;
  /** 主色（按钮/强调） */
  primary: string;
  /** 悬停/弱强调底 */
  accent: string;
  /** 正文色（画在 background 预览块上的文字） */
  foreground: string;
}

export interface ThemeDefinition {
  id: ThemeId;
  /** null=跟随 light/dark/system 三态；非 null=该主题固定明暗 */
  mode: ResolvedMode | null;
  preview: ThemePreview;
}

/** HSL 三元组转 CSS hsl() 字符串（预览内联样式用） */
export function hsl(h: number, s: number, l: number): string {
  return `hsl(${h} ${s}% ${l}%)`;
}

export const THEME_REGISTRY: ThemeDefinition[] = [
  {
    id: 'stellar',
    mode: null,
    preview: {
      background: hsl(0, 0, 100),
      card: hsl(0, 0, 100),
      primary: hsl(221, 83, 53),
      accent: hsl(210, 40, 94),
      foreground: hsl(222, 47, 11),
    },
  },
  {
    id: 'nocturne-gold',
    mode: 'dark',
    preview: {
      background: hsl(30, 14, 9),
      card: hsl(30, 13, 12),
      primary: hsl(38, 72, 58),
      accent: hsl(34, 24, 24),
      foreground: hsl(40, 30, 88),
    },
  },
  {
    id: 'moonwhite',
    mode: 'light',
    preview: {
      background: hsl(210, 20, 98),
      card: hsl(0, 0, 100),
      primary: hsl(222, 45, 42),
      accent: hsl(214, 28, 90),
      foreground: hsl(222, 32, 14),
    },
  },
  {
    id: 'sakura',
    mode: 'light',
    preview: {
      background: hsl(340, 30, 97),
      card: hsl(0, 0, 100),
      primary: hsl(340, 65, 44),
      accent: hsl(340, 32, 90),
      foreground: hsl(328, 28, 16),
    },
  },
];

const REGISTRY_MAP = new Map<ThemeId, ThemeDefinition>(THEME_REGISTRY.map((t) => [t.id, t]));

export function getThemeDefinition(id: ThemeId): ThemeDefinition {
  return REGISTRY_MAP.get(id) ?? THEME_REGISTRY[0]!;
}

/** system 偏好按操作系统解析后的实际明暗 */
export function resolvePreference(theme: Theme): ResolvedMode {
  if (theme === 'system') {
    return typeof window !== 'undefined' &&
      window.matchMedia('(prefers-color-scheme: dark)').matches
      ? 'dark'
      : 'light';
  }
  return theme;
}

/**
 * 某主题 + 用户三态偏好最终生效的明暗：
 * 命名主题固定归属优先；stellar 跟随偏好。
 */
export function resolveThemeMode(themeId: ThemeId, theme: Theme): ResolvedMode {
  const def = getThemeDefinition(themeId);
  return def.mode ?? resolvePreference(theme);
}

export { DEFAULT_THEME_ID, THEME_IDS };
