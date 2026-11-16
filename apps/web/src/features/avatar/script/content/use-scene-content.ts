'use client';

import { useEffect, useState } from 'react';
import type { SceneContent } from '@wbfm/core/services';
import type { Scene } from '@wbfm/shared/schemas';
import { apiGet } from '@/lib/api/client';

const EMPTY: SceneContent = { version: 'none', scenes: [] };

/** v4.3 M2：每次挂载读取一次场景包快照；安装/停用后下一次挂载生效 */
export function useSceneContent(enabled: boolean): {
  scenes: readonly Scene[];
  version: string;
  ready: boolean;
} {
  const [content, setContent] = useState<SceneContent | null>(null);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    apiGet<SceneContent>('/api/scene-content')
      .then((value) => {
        if (!cancelled) setContent(isSceneContent(value) ? value : EMPTY);
      })
      .catch(() => {
        if (!cancelled) setContent(EMPTY);
      });
    return () => {
      cancelled = true;
    };
  }, [enabled]);

  const current = content ?? EMPTY;
  return { scenes: current.scenes, version: current.version, ready: content !== null };
}

function isSceneContent(value: unknown): value is SceneContent {
  if (!value || typeof value !== 'object') return false;
  const record = value as Record<string, unknown>;
  return typeof record.version === 'string' && Array.isArray(record.scenes);
}
