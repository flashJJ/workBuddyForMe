'use client';

import { useMemo } from 'react';
import type { BackgroundScope } from '@wbfm/shared/schemas';
import { useSettings } from '@/lib/hooks/provider';
import { mergeBackgroundConfig, resolveBackground, type ResolvedBackground } from './resolve';
import { useBackgroundFiles } from './use-background-files';
import { useWallpaperContent } from './use-wallpaper-content';

export interface BackgroundView {
  resolved: ResolvedBackground;
  fit: 'cover' | 'contain';
  dim: number;
  blur: number;
  mode?: 'chat' | 'window';
}

/** v4.4 M4：按作用域读取设置、用户文件与壁纸包，解析成可渲染背景 */
export function useBackground(scope: BackgroundScope): BackgroundView {
  const { data: settings } = useSettings();
  const files = useBackgroundFiles();
  const { wallpapers } = useWallpaperContent();
  const update = settings?.background?.[scope];

  const config = useMemo(() => mergeBackgroundConfig(scope, update), [scope, update]);
  const resolved = useMemo(
    () => resolveBackground(config, { files, wallpapers, fallback: scope !== 'pet' }),
    [config, files, wallpapers, scope],
  );

  const mode = scope === 'main' && update && 'mode' in update ? update.mode : undefined;

  return {
    resolved,
    fit: config.fit,
    dim: config.dim,
    blur: config.blur,
    mode,
  };
}
