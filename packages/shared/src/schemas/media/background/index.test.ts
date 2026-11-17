import { describe, expect, it } from 'vitest';
import { settingsUpdateSchema } from '../../ops/settings';
import {
  DEFAULT_BACKGROUND_SETTINGS,
  DEFAULT_PET_BACKGROUND,
  backgroundSettingsUpdateSchema,
  isChatMode,
} from './index';

describe('v4.4 背景设置契约', () => {
  it('默认值：主窗口使用森林露营内置背景，舞台沿用剧集背景，桌宠保持透明', () => {
    expect(DEFAULT_BACKGROUND_SETTINGS.main.source).toEqual({
      kind: 'builtin',
      id: 'wallpaper.main.forest-camp-loop',
    });
    expect(DEFAULT_BACKGROUND_SETTINGS.stage.source).toEqual({ kind: 'builtin', id: 'none' });
    expect(DEFAULT_PET_BACKGROUND.source).toEqual({ kind: 'builtin', id: 'none' });
    expect(DEFAULT_PET_BACKGROUND.dim).toBe(0);
  });

  it('接受三种来源与主窗口互斥模式', () => {
    const parsed = backgroundSettingsUpdateSchema.parse({
      main: { mode: 'window', source: { kind: 'video', id: 'video-abc' }, dim: 0.4 },
      stage: { source: { kind: 'image', id: 'image-xyz' }, blur: 8, fit: 'contain' },
      pet: { source: { kind: 'builtin', id: 'none' } },
    });
    expect(parsed.main?.mode).toBe('window');
    expect(parsed.stage?.fit).toBe('contain');
    expect(
      backgroundSettingsUpdateSchema.parse({
        main: { source: { kind: 'builtin', id: 'wallpaper.main.tidal-door' } },
      }).main?.source,
    ).toEqual({ kind: 'builtin', id: 'wallpaper.main.tidal-door' });
  });

  it('拒绝未知内置 id 与越界数值', () => {
    expect(() =>
      backgroundSettingsUpdateSchema.parse({ stage: { source: { kind: 'builtin', id: 'nope' } } }),
    ).toThrow();
    expect(() =>
      backgroundSettingsUpdateSchema.parse({ stage: { dim: 1.5 } }),
    ).toThrow();
    expect(() =>
      backgroundSettingsUpdateSchema.parse({ stage: { blur: 21 } }),
    ).toThrow();
  });

  it('stage/pet 不接受 mode（多余字段被剥离）', () => {
    const parsed = backgroundSettingsUpdateSchema.parse({
      stage: { mode: 'chat' } as unknown as { mode?: string },
    });
    expect(parsed.stage && 'mode' in parsed.stage).toBe(false);
  });

  it('全量设置写入可携带 background', () => {
    const parsed = settingsUpdateSchema.parse({
      background: { main: { mode: 'chat', fit: 'cover' } },
    });
    expect(parsed.background?.main?.mode).toBe('chat');
  });

  it('主窗口模式缺省即整屏', () => {
    expect(isChatMode(undefined)).toBe(false);
    expect(isChatMode('chat')).toBe(true);
    expect(isChatMode('window')).toBe(false);
  });
});
