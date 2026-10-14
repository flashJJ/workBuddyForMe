// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_THEME_ID,
  THEME_IDS,
  THEME_REGISTRY,
  getThemeDefinition,
  hsl,
  resolveThemeMode,
} from './theme-registry';

describe('theme registry', () => {
  it('注册表与 shared 枚举一一对应，无重复 id，默认主题存在且跟随三态', () => {
    expect(THEME_REGISTRY.map((t) => t.id)).toEqual([...THEME_IDS]);
    expect(new Set(THEME_REGISTRY.map((t) => t.id)).size).toBe(THEME_IDS.length);
    const stellar = getThemeDefinition(DEFAULT_THEME_ID);
    expect(stellar.id).toBe('stellar');
    expect(stellar.mode).toBeNull();
  });

  it('每个主题预览 5 个色板齐全且为合法 hsl() 字符串', () => {
    for (const def of THEME_REGISTRY) {
      expect(def.preview.background).toMatch(/^hsl\(/);
      for (const key of ['card', 'primary', 'accent', 'foreground'] as const) {
        expect(def.preview[key], `${def.id}.${key}`).toMatch(/^hsl\(/);
      }
    }
  });

  it('命名主题固定明暗：夜金 dark，月白/樱粉 light', () => {
    expect(getThemeDefinition('nocturne-gold').mode).toBe('dark');
    expect(getThemeDefinition('moonwhite').mode).toBe('light');
    expect(getThemeDefinition('sakura').mode).toBe('light');
  });

  it('resolveThemeMode：stellar 跟随偏好（含 system 解析），命名主题忽略偏好', () => {
    expect(resolveThemeMode('stellar', 'light')).toBe('light');
    expect(resolveThemeMode('stellar', 'dark')).toBe('dark');
    // 偏好 light 但选中夜金：固定 dark
    expect(resolveThemeMode('nocturne-gold', 'light')).toBe('dark');
    expect(resolveThemeMode('nocturne-gold', 'system')).toBe('dark');
    expect(resolveThemeMode('sakura', 'dark')).toBe('light');
    expect(resolveThemeMode('moonwhite', 'system')).toBe('light');
  });

  it('resolveThemeMode：stellar+system 跟随 matchMedia（模拟暗色系统）', () => {
    const spy = vi
      .spyOn(window, 'matchMedia')
      .mockImplementation(
        (q) =>
          ({
            matches: q === '(prefers-color-scheme: dark)',
            addEventListener: () => undefined,
            removeEventListener: () => undefined,
          }) as MediaQueryList,
      );
    expect(resolveThemeMode('stellar', 'system')).toBe('dark');
    expect(resolveThemeMode('nocturne-gold', 'system')).toBe('dark');
    spy.mockRestore();
  });

  it('未知 id 回落品牌默认（防御）', () => {
    expect(getThemeDefinition('unknown' as never).id).toBe(DEFAULT_THEME_ID);
  });

  it('hsl() 输出标准三元组格式', () => {
    expect(hsl(221, 83, 53)).toBe('hsl(221 83% 53%)');
  });
});
