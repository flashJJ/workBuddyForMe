'use client';

import * as React from 'react';
import type { PetVoiceState } from '@wbfm/shared/pet';

/** 多久没有和桌宠互动就转身背对（毫秒） */
export const PET_AWAY_AFTER_MS = 75_000;
/** 计时粒度：转身是分钟级事件，5s 足够 */
const CHECK_MS = 5_000;

/**
 * v3.5 桌宠「背对」状态：
 * - 指针在桌宠窗内移动/按下、或开始说话 → 立即转回并重置计时；
 * - 连续 75s 无上述互动 → 背对（由姿态层平滑转 180°）；
 * - 点击时指针事件先唤醒，随后 Resolver 的 tap 台词在同一拍播出。
 */
export function usePetFaceAway(voiceState: PetVoiceState): boolean {
  const [away, setAway] = React.useState(false);
  const awayRef = React.useRef(false);
  const lastActiveRef = React.useRef(Date.now());

  const wake = React.useCallback(() => {
    lastActiveRef.current = Date.now();
    if (!awayRef.current) return;
    awayRef.current = false;
    setAway(false);
  }, []);

  React.useEffect(() => {
    window.addEventListener('pointermove', wake, { passive: true });
    window.addEventListener('pointerdown', wake, { passive: true });
    const timer = window.setInterval(() => {
      if (awayRef.current) return;
      if (Date.now() - lastActiveRef.current < PET_AWAY_AFTER_MS) return;
      awayRef.current = true;
      setAway(true);
    }, CHECK_MS);
    return () => {
      window.removeEventListener('pointermove', wake);
      window.removeEventListener('pointerdown', wake);
      window.clearInterval(timer);
    };
  }, [wake]);

  React.useEffect(() => {
    if (voiceState !== 'idle') wake();
  }, [voiceState, wake]);

  return away;
}
