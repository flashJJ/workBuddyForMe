import { describe, expect, it } from 'vitest';
import type { WallpaperPackPayload } from '@wbfm/shared/schemas';
import { mergeWallpaperContent, type WallpaperPackSource } from './index';

function source(id: string, version = '1.0.0'): WallpaperPackSource {
  const payload: WallpaperPackPayload = {
    name: '示例',
    description: '',
    backgrounds: [
      { id: `wallpaper.${id}`, kind: 'image', file: 'payload/a.png', license: 'CC0-1.0' },
    ],
  };
  return { id, version, payload };
}

describe('v4.4 M3 背景内容快照', () => {
  it('无包返回 none', () => {
    expect(mergeWallpaperContent([])).toEqual({ version: 'none', wallpapers: [] });
  });

  it('聚合出资源路由与快照版本', () => {
    const content = mergeWallpaperContent([source('com.example.a')]);
    expect(content.version).toMatch(/^wallpapers:[0-9a-f]{12}$/);
    expect(content.wallpapers[0]?.url).toBe(
      '/api/wallpaper-assets?pack=com.example.a&file=payload%2Fa.png',
    );
  });

  it('跨包重复 id fail-closed', () => {
    const a = source('com.example.a');
    const b: WallpaperPackSource = {
      id: 'com.example.b',
      version: '1.0.0',
      payload: {
        name: '示例 B',
        description: '',
        backgrounds: [
          { id: 'wallpaper.com.example.a', kind: 'image', file: 'payload/b.png', license: 'CC0-1.0' },
        ],
      },
    };
    expect(() => mergeWallpaperContent([a, b])).toThrow(/背景 id 冲突/);
  });
});
