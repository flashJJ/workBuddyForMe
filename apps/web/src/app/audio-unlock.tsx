'use client';

import * as React from 'react';
import { audioDirector } from '@/features/audio';

/**
 * v4.2：首次用户手势统一解锁所有音频子系统。
 * 语音的 AudioContext、剧场音效上下文与音乐重试都注册在 AudioDirector 上。
 */
export function AudioUnlockListener(): null {
  React.useEffect(() => {
    const unlock = () => {
      audioDirector.unlock();
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
    };
    window.addEventListener('pointerdown', unlock, { once: true });
    window.addEventListener('keydown', unlock, { once: true });
    return () => {
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
    };
  }, []);

  return null;
}
