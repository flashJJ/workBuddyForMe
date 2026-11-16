'use client';

import { useEffect, useState } from 'react';
import type { WbfmBackgroundFile } from '@wbfm/shared/background';

/** v4.4 M4：读取桌面端已复制的背景；纯 Web 环境返回空列表 */
export function useBackgroundFiles(): readonly WbfmBackgroundFile[] {
  const [files, setFiles] = useState<WbfmBackgroundFile[]>([]);

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
  }, []);

  return files;
}
