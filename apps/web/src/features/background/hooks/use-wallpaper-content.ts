'use client';

import { useEffect, useState } from 'react';
import type { WallpaperContent } from '@wbfm/core/services';
import { apiGet } from '@/lib/api/client';

const EMPTY: WallpaperContent = { version: 'none', wallpapers: [] };

/** v4.4 M4：每次挂载读取一次壁纸包快照；安装/停用后下一次挂载生效 */
export function useWallpaperContent(): {
  wallpapers: WallpaperContent['wallpapers'];
  version: string;
} {
  const [content, setContent] = useState<WallpaperContent | null>(null);

  useEffect(() => {
    let cancelled = false;
    apiGet<WallpaperContent>('/api/wallpaper-content')
      .then((value) => {
        if (!cancelled) setContent(isWallpaperContent(value) ? value : EMPTY);
      })
      .catch(() => {
        if (!cancelled) setContent(EMPTY);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const current = content ?? EMPTY;
  return { wallpapers: current.wallpapers, version: current.version };
}

function isWallpaperContent(value: unknown): value is WallpaperContent {
  if (!value || typeof value !== 'object') return false;
  const record = value as Record<string, unknown>;
  return typeof record.version === 'string' && Array.isArray(record.wallpapers);
}
