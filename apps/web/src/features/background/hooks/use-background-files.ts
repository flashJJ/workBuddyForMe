'use client';

import { useCallback, useEffect, useState } from 'react';
import type { WbfmBackgroundFile } from '@wbfm/shared/background';

/** v4.4 M4：读取桌面端已复制的背景；纯 Web 环境返回空列表 */
export function useBackgroundFiles(): {
  files: readonly WbfmBackgroundFile[];
  reload: () => void;
} {
  const [files, setFiles] = useState<WbfmBackgroundFile[]>([]);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const bridge = typeof window === 'undefined' ? undefined : window.wbfm?.background;
    if (!bridge) return;
    let cancelled = false;
    bridge
      .list()
      .then((value) => {
        if (!cancelled && Array.isArray(value)) setFiles(value);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [tick]);

  const reload = useCallback(() => setTick((value) => value + 1), []);
  return { files, reload };
}
