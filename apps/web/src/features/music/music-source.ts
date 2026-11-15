'use client';

import * as React from 'react';
import type { MusicTrack } from './music-tracks';
import { readImportedMusicBlob } from './music-storage';

/**
 * 解析当前曲目的可播放地址：
 * - 内置曲目直接用 public 静态路径；
 * - 导入曲目从 IndexedDB 取 Blob，生成临时 URL 并在切歌/卸载时回收。
 */
export function useMusicSource(current: MusicTrack | null): {
  src: string | null;
  missing: boolean;
} {
  const [src, setSrc] = React.useState<string | null>(null);
  const [missing, setMissing] = React.useState(false);

  React.useEffect(() => {
    let cancelled = false;
    let objectUrl: string | null = null;
    setMissing(false);
    if (!current) {
      setSrc(null);
      return;
    }
    if (current.source === 'builtin') {
      setSrc(current.src ?? null);
      return;
    }
    void readImportedMusicBlob(current.id).then((blob) => {
      if (cancelled) return;
      if (!blob) {
        setSrc(null);
        setMissing(true);
        return;
      }
      objectUrl = URL.createObjectURL(blob);
      setSrc(objectUrl);
    });
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [current?.id, current?.source, current?.src]);

  return { src, missing };
}
