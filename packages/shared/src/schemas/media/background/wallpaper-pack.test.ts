import { describe, expect, it } from 'vitest';
import { wallpaperPackPayloadSchema } from './wallpaper-pack';

function payload(overrides: Record<string, unknown> = {}) {
  return {
    name: '示例壁纸包',
    backgrounds: [
      {
        id: 'wallpaper.sample.dusk',
        kind: 'image',
        file: 'payload/assets/dusk.png',
        license: 'CC0-1.0',
      },
    ],
    ...overrides,
  };
}

describe('v4.4 wallpaper-pack payload', () => {
  it('接受图片与视频背景', () => {
    const parsed = wallpaperPackPayloadSchema.parse(
      payload({
        backgrounds: [
          { id: 'wallpaper.a', kind: 'image', file: 'payload/a.webp', license: 'CC0-1.0' },
          { id: 'wallpaper.b', kind: 'video', file: 'payload/b.mp4', license: 'CC-BY-4.0' },
        ],
      }),
    );
    expect(parsed.backgrounds).toHaveLength(2);
  });

  it('id 必须带 wallpaper. 前缀', () => {
    expect(() =>
      wallpaperPackPayloadSchema.parse(
        payload({
          backgrounds: [
            { id: 'pack.a', kind: 'image', file: 'payload/a.png', license: 'CC0-1.0' },
          ],
        }),
      ),
    ).toThrow();
  });

  it('视频只接受 mp4，图片拒绝 mp4', () => {
    expect(() =>
      wallpaperPackPayloadSchema.parse(
        payload({
          backgrounds: [
            { id: 'wallpaper.a', kind: 'video', file: 'payload/a.png', license: 'CC0-1.0' },
          ],
        }),
      ),
    ).toThrow();
    expect(() =>
      wallpaperPackPayloadSchema.parse(
        payload({
          backgrounds: [
            { id: 'wallpaper.a', kind: 'image', file: 'payload/a.mp4', license: 'CC0-1.0' },
          ],
        }),
      ),
    ).toThrow();
  });

  it('拒绝重复 id 与非法许可', () => {
    expect(() =>
      wallpaperPackPayloadSchema.parse(
        payload({
          backgrounds: [
            { id: 'wallpaper.a', kind: 'image', file: 'payload/a.png', license: 'CC0-1.0' },
            { id: 'wallpaper.a', kind: 'image', file: 'payload/b.png', license: 'CC0-1.0' },
          ],
        }),
      ),
    ).toThrow();
    expect(() =>
      wallpaperPackPayloadSchema.parse(
        payload({
          backgrounds: [
            { id: 'wallpaper.a', kind: 'image', file: 'payload/a.png', license: 'MIT' },
          ],
        }),
      ),
    ).toThrow();
  });

  it('最多 10 个背景', () => {
    const backgrounds = Array.from({ length: 11 }, (_, index) => ({
      id: `wallpaper.w${index}`,
      kind: 'image',
      file: `payload/${index}.png`,
      license: 'CC0-1.0',
    }));
    expect(() => wallpaperPackPayloadSchema.parse(payload({ backgrounds }))).toThrow();
  });
});
