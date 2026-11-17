import { describe, expect, it } from 'vitest';
import { DEFAULT_BACKGROUND_SETTINGS, type BackgroundConfig } from '@wbfm/shared/schemas';
import { mergeBackgroundConfig, resolveBackground } from './resolve';

const config = (source: BackgroundConfig['source']): BackgroundConfig => ({
  source,
  fit: 'cover',
  dim: 0.15,
  blur: 0,
});

const files = [
  { id: '11111111-1111-4111-8111-111111111111.png', kind: 'image' as const, name: 'a.png', bytes: 10 },
  { id: '22222222-2222-4222-8222-222222222222.mp4', kind: 'video' as const, name: 'b.mp4', bytes: 10 },
];

const wallpapers = [
  { id: 'wallpaper.pack.a', kind: 'image' as const, url: '/api/wallpaper-assets?pack=com.example&file=a.png' },
];

describe('v4.4 M4 背景解析', () => {
  it('默认值按作用域合并', () => {
    expect(mergeBackgroundConfig('main').source).toEqual({
      kind: 'builtin',
      id: 'wallpaper.main.forest-camp-loop',
    });
    expect(mergeBackgroundConfig('stage').source).toEqual({ kind: 'builtin', id: 'none' });
    expect(mergeBackgroundConfig('pet').source).toEqual({ kind: 'builtin', id: 'none' });
    expect(mergeBackgroundConfig('main', { dim: 0.4 }).dim).toBe(0.4);
  });

  it('内置背景解析为视频或渐变', () => {
    expect(resolveBackground(config({ kind: 'builtin', id: 'wallpaper.rainy-room' }), { files: [], wallpapers: [] })).toEqual({
      kind: 'video',
      url: '/backgrounds/rainy-room.mp4',
      poster: '/backgrounds/rainy-room.jpg',
    });
    expect(resolveBackground(config({ kind: 'builtin', id: 'wallpaper.dusk' }), { files: [], wallpapers: [] }).kind).toBe(
      'gradient',
    );
    expect(
      resolveBackground(config({ kind: 'builtin', id: 'wallpaper.main.tidal-door' }), {
        files: [],
        wallpapers: [],
      }),
    ).toEqual({
      kind: 'video',
      url: '/backgrounds/tidal-door.mp4',
      poster: '/backgrounds/tidal-door.jpg',
    });
  });

  it('本地文件优先于同名包内资源', () => {
    const resolved = resolveBackground(
      config({ kind: 'image', id: files[0]!.id }),
      { files, wallpapers },
    );
    expect(resolved).toEqual({ kind: 'image', url: `/api/backgrounds/${files[0]!.id}` });
  });

  it('包内资源可用时解析为图片', () => {
    expect(resolveBackground(config({ kind: 'image', id: 'wallpaper.pack.a' }), { files, wallpapers })).toEqual({
      kind: 'image',
      url: '/api/wallpaper-assets?pack=com.example&file=a.png',
    });
  });

  it('资源缺失回退：非桌宠回退内置，桌宠保持透明', () => {
    expect(
      resolveBackground(config({ kind: 'image', id: 'missing' }), { files: [], wallpapers: [] }),
    ).toEqual({
      kind: 'video',
      url: '/backgrounds/forest-camp-loop.mp4',
      poster: '/backgrounds/forest-camp-loop.jpg',
    });
    expect(
      resolveBackground(config({ kind: 'image', id: 'missing' }), {
        files: [],
        wallpapers: [],
        fallback: false,
      }),
    ).toEqual({ kind: 'none' });
  });

  it('none 返回空背景', () => {
    expect(resolveBackground(DEFAULT_BACKGROUND_SETTINGS.stage, { files, wallpapers })).toEqual({
      kind: 'none',
    });
  });
});
