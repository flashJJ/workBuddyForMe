'use client';

import { useEffect, useState } from 'react';
import { DEFAULT_MOTION_CONTENT, type MotionContent } from '@wbfm/motion';
import { apiGet } from '@/lib/api/client';

/** v4.0 M4：每次挂载读取一次内容快照；安装/停用后下一次打开舞台/桌宠生效 */
export function useMotionContent(): { content: MotionContent; ready: boolean } {
  const [content, setContent] = useState<MotionContent | null>(null);

  useEffect(() => {
    let cancelled = false;
    const fallback = setTimeout(() => {
      if (!cancelled) setContent(DEFAULT_MOTION_CONTENT);
    }, 3_000);
    apiGet<MotionContent>('/api/motion-content')
      .then((value) => {
        if (!cancelled) setContent(isMotionContent(value) ? value : DEFAULT_MOTION_CONTENT);
      })
      .catch(() => {
        if (!cancelled) setContent(DEFAULT_MOTION_CONTENT);
      })
      .finally(() => clearTimeout(fallback));
    return () => {
      cancelled = true;
      clearTimeout(fallback);
    };
  }, []);

  return { content: content ?? DEFAULT_MOTION_CONTENT, ready: content !== null };
}

function isMotionContent(value: unknown): value is MotionContent {
  if (!value || typeof value !== 'object') return false;
  const record = value as Record<string, unknown>;
  return (
    typeof record.version === 'string' &&
    Array.isArray(record.poses) &&
    Array.isArray(record.motions) &&
    Array.isArray(record.behaviors)
  );
}
