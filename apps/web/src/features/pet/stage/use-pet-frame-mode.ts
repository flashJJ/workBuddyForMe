'use client';

import * as React from 'react';
import type { PetVoiceState } from '@wbfm/shared/pet';
import type { FrameMode } from '@/features/avatar';

/** 交互停止后维持 60fps 的尾巴（拖拽/指针移动的余韵，避免立刻掉到 30） */
const IDLE_AFTER_INTERACT_MS = 1500;

/**
 * v3.0 P0 桌宠帧率档位：
 * - 指针在窗内移动/按下、说话/聆听/思考 → interact（60）
 * - 1.5s 无交互且语音空闲 → idle（30）
 * - 页面不可见（最小化/被切换）→ hidden（0，停渲染）
 */
export function usePetFrameMode(voiceState: PetVoiceState): FrameMode {
  const [interacting, setInteracting] = React.useState(false);
  const [visible, setVisible] = React.useState(true);
  const timerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  const bump = React.useCallback(() => {
    setInteracting(true);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setInteracting(false), IDLE_AFTER_INTERACT_MS);
  }, []);

  React.useEffect(() => {
    const onMove = () => bump();
    window.addEventListener('pointermove', onMove, { passive: true });
    window.addEventListener('pointerdown', onMove, { passive: true });
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerdown', onMove);
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [bump]);

  React.useEffect(() => {
    const onVisibility = () => setVisible(document.visibilityState !== 'hidden');
    onVisibility();
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, []);

  if (!visible) return 'hidden';
  return voiceState !== 'idle' || interacting ? 'interact' : 'idle';
}
