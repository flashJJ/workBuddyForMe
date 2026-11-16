import type { ResolvedBackground } from './resolve';
import { GALLERY_BACKGROUND_ITEMS } from './gallery';

/** v4.4 M4：内置背景清单（视频随安装包，静态壁纸为程序化渐变） */
const STATIC_BUILTINS: Record<string, ResolvedBackground> = {
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

/** v4.4 M6：用户图集（脚本压缩后生成，静态图片） */
export const BUILTIN_GALLERY_ITEMS = GALLERY_BACKGROUND_ITEMS;

export interface BuiltinPetBackgroundItem {
  id: string;
  url: string;
  label: string;
  kind: 'image' | 'video';
}

/** v4.4 M6：桌宠专用背景（9:16，视频 480×854 / 图片 810×1440） */
export const BUILTIN_PET_ITEMS: readonly BuiltinPetBackgroundItem[] = [
  { id: 'wallpaper.pet.deepsea-loop', url: '/backgrounds/pet/deepsea-loop.mp4', label: '深海静流（循环视频）', kind: 'video' },
  { id: 'wallpaper.pet.night-desk-loop', url: '/backgrounds/pet/night-desk-loop.mp4', label: '台灯书桌（循环视频）', kind: 'video' },
  { id: 'wallpaper.pet.deepsea', url: '/backgrounds/pet/deepsea.webp', label: '深海静流（静态）', kind: 'image' },
  { id: 'wallpaper.pet.night-desk', url: '/backgrounds/pet/night-desk.webp', label: '台灯书桌（静态）', kind: 'image' },
  { id: 'wallpaper.pet.rain-platform', url: '/backgrounds/pet/rain-platform.webp', label: '雨夜站台（静态）', kind: 'image' },
];

export const BUILTIN_BACKGROUNDS: Record<string, ResolvedBackground> = {
  ...STATIC_BUILTINS,
  ...Object.fromEntries(
    GALLERY_BACKGROUND_ITEMS.map((item) => [item.id, { kind: 'image', url: item.url }]),
  ),
  ...Object.fromEntries(
    BUILTIN_PET_ITEMS.map((item) => [item.id, { kind: item.kind, url: item.url }]),
  ),
};

/** 本地文件或包内资源失效时的回退（桌宠保持透明） */
export const BUILTIN_FALLBACK: ResolvedBackground = BUILTIN_BACKGROUNDS['wallpaper.rainy-room']!;
export const NONE_BACKGROUND: ResolvedBackground = { kind: 'none' };
