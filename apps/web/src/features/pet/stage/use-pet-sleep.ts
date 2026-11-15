'use client';

import * as React from 'react';
import type { PetVoiceState } from '@wbfm/shared/pet';

/** 无交互多久进入睡眠（与 04-animation-behavior 的 10min 对齐） */
export const PET_SLEEP_AFTER_MS = 10 * 60 * 1000;
/** 检查间隔：不需要每秒轮询，30s 足够；命中后最迟 30s 内入睡 */
const CHECK_INTERVAL_MS = 30_000;

export interface PetSleepState {
  sleeping: boolean;
  /** 主动唤醒并刷新活跃时间（主动播放前调用） */
  wake: () => void;
}

/**
 * v3.0 P1 桌宠睡眠状态机：
 * - 指针移动/按下、语音非 idle → 立即唤醒并刷新活跃时间；
 * - 连续 10min 无交互 → 入睡（由渲染器切换闭眼/低头表现）；
 * - P8.8：主动播放前可调用 wake()，避免睡着演出。
 */
export function usePetSleep(voiceState: PetVoiceState): PetSleepState {
  const [sleeping, setSleeping] = React.useState(false);
  const lastActiveRef = React.useRef(Date.now());
  const sleepingRef = React.useRef(false);

  const wake = React.useCallback(() => {
    lastActiveRef.current = Date.now();
    if (sleepingRef.current) {
      sleepingRef.current = false;
      setSleeping(false);
    }
  }, []);

  React.useEffect(() => {
    const onActivity = () => wake();
    window.addEventListener('pointermove', onActivity, { passive: true });
    window.addEventListener('pointerdown', onActivity, { passive: true });
    const timer = setInterval(() => {
      if (sleepingRef.current) return;
      if (Date.now() - lastActiveRef.current < PET_SLEEP_AFTER_MS) return;
      sleepingRef.current = true;
      setSleeping(true);
    }, CHECK_INTERVAL_MS);
    return () => {
      window.removeEventListener('pointermove', onActivity);
      window.removeEventListener('pointerdown', onActivity);
      clearInterval(timer);
    };
  }, [wake]);

  React.useEffect(() => {
    if (voiceState !== 'idle') wake();
  }, [voiceState, wake]);

  return { sleeping, wake };
}
