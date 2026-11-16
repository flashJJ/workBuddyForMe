'use client';

import { useSyncExternalStore } from 'react';
import { audioDirector } from './director';
import type { AudioDirectorSnapshot } from './types';

/** 订阅 AudioDirector 快照；不触发任何音频副作用 */
export function useAudioDirector(): AudioDirectorSnapshot {
  return useSyncExternalStore(
    audioDirector.subscribe,
    audioDirector.getSnapshot,
    audioDirector.getSnapshot,
  );
}
