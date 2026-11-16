import type { ResolvedBackground } from './resolve';

/** v4.4 M4：内置背景清单（视频随安装包，静态壁纸为程序化渐变） */
export const BUILTIN_BACKGROUNDS: Record<string, ResolvedBackground> = {
  none: { kind: 'none' },
  'wallpaper.rainy-room': { kind: 'video', url: '/backgrounds/rainy-room.mp4' },
  'wallpaper.dusk': {
    kind: 'gradient',
    gradient: 'linear-gradient(160deg, #2b1d3a 0%, #7a4a5e 55%, #e0a878 100%)',
  },
  'wallpaper.morning': {
    kind: 'gradient',
    gradient: 'linear-gradient(160deg, #b8d8e8 0%, #f2e6c8 60%, #f6d8a8 100%)',
  },
};

/** 本地文件或包内资源失效时的回退（桌宠保持透明） */
export const BUILTIN_FALLBACK: ResolvedBackground = BUILTIN_BACKGROUNDS['wallpaper.rainy-room']!;
export const NONE_BACKGROUND: ResolvedBackground = { kind: 'none' };
