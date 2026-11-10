'use client';

import * as React from 'react';
import type { MessageKey } from '@wbfm/shared/i18n';
import type { PetVoiceState } from '@wbfm/shared/pet';
import { pickPetLine } from '@wbfm/shared/schemas';

/** 静默多久才有资格开口（先让人专注一阵子） */
export const AMBIENT_IDLE_BEFORE_MS = 3 * 60 * 1000;
/** 两次低语的最小间隔与随机抖动：15–25 分钟 */
export const AMBIENT_MIN_GAP_MS = 15 * 60 * 1000;
export const AMBIENT_GAP_JITTER_MS = 10 * 60 * 1000;
/** 每小时上限（「低：每小时 2–3 句」档） */
export const AMBIENT_MAX_PER_HOUR = 3;
/** 检查节拍：低语是分钟级事件，15s 粒度足够 */
const CHECK_MS = 15_000;
const HOUR_MS = 60 * 60 * 1000;

export interface PetAmbientTalkArgs {
  /** 台词总开关 && 非勿扰（睡眠/说话由本 hook 内部判断） */
  enabled: boolean;
  sleeping: boolean;
  voiceState: PetVoiceState;
  t: (key: MessageKey) => string;
  speak: (text: string, durationMs: number) => void;
}

/**
 * L2 桌宠自主低语：静默 3 分钟后，每 15–25 分钟最多说一句本地短句。
 *
 * - 只在桌宠窗口内运行；不含 TTS，不产生模型调用；
 * - 睡眠 / 说话（voiceState≠idle）/ 勿扰 / 台词开关关闭时静默；
 * - 指针活动会顺延静默计时，用户正在逗它时不会「自言自语」。
 */
export function usePetAmbientTalk(args: PetAmbientTalkArgs): void {
  const argsRef = React.useRef(args);
  argsRef.current = args;
  const lastActiveRef = React.useRef(Date.now());
  const nextAtRef = React.useRef(Date.now() + AMBIENT_IDLE_BEFORE_MS);
  const spokenAtRef = React.useRef<number[]>([]);

  React.useEffect(() => {
    const onActivity = () => {
      lastActiveRef.current = Date.now();
    };
    window.addEventListener('pointerdown', onActivity, { passive: true });
    window.addEventListener('pointermove', onActivity, { passive: true });

    const timer = window.setInterval(() => {
      const a = argsRef.current;
      if (!a.enabled || a.sleeping || a.voiceState !== 'idle') return;
      const now = Date.now();
      if (now - lastActiveRef.current < AMBIENT_IDLE_BEFORE_MS) return;
      if (now < nextAtRef.current) return;

      spokenAtRef.current = spokenAtRef.current.filter((at) => now - at < HOUR_MS);
      if (spokenAtRef.current.length >= AMBIENT_MAX_PER_HOUR) {
        // 额度用尽：至少再等一个间隔，避免每分钟重试
        nextAtRef.current = now + AMBIENT_MIN_GAP_MS;
        return;
      }
      spokenAtRef.current.push(now);
      nextAtRef.current = now + AMBIENT_MIN_GAP_MS + Math.random() * AMBIENT_GAP_JITTER_MS;
      a.speak(a.t(pickPetLine('ambient')), 3600);
    }, CHECK_MS);

    return () => {
      window.removeEventListener('pointerdown', onActivity);
      window.removeEventListener('pointermove', onActivity);
      window.clearInterval(timer);
    };
  }, []);
}
