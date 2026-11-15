'use client';

import * as React from 'react';
import type { MessageKey } from '@wbfm/shared/i18n';
import type { PetVoiceState } from '@wbfm/shared/pet';
import {
  pickPetLine,
  type PetLinePoolId,
  type PetScriptDecisionWorkState,
} from '@wbfm/shared/schemas';

/** 静默多久才有资格开口（先让人专注一阵子） */
export const AMBIENT_IDLE_BEFORE_MS = 3 * 60 * 1000;
/** 两次低语的最小间隔与随机抖动：15–25 分钟 */
export const AMBIENT_MIN_GAP_MS = 15 * 60 * 1000;
export const AMBIENT_GAP_JITTER_MS = 10 * 60 * 1000;
/** 每小时上限（「低：每小时 2–3 句」档） */
export const AMBIENT_MAX_PER_HOUR = 3;
/** v3.0 M1：超过 2 小时无互动视为「长时间未互动」 */
export const LONG_IDLE_MS = 2 * 60 * 60 * 1000;
/** 检查节拍：低语是分钟级事件，15s 粒度足够 */
const CHECK_MS = 15_000;
const HOUR_MS = 60 * 60 * 1000;
const LAST_ACTIVE_KEY = 'wbfm.pet.lastActiveAt';
const PERSIST_THROTTLE_MS = 30_000;

export interface PetAmbientTalkArgs {
  /** 台词总开关 && 非勿扰（睡眠/说话由本 hook 内部判断） */
  enabled: boolean;
  sleeping: boolean;
  voiceState: PetVoiceState;
  t: (key: MessageKey) => string;
  speak: (text: string, durationMs: number) => void;
  /** 取当前小时（测试注入；缺省读系统时间） */
  hour?: () => number;
  /** M3 Utility：工作信号为忙时闭嘴，避免打断（缺省 unknown） */
  work?: PetScriptDecisionWorkState;
}

/** 分层台词选池：深夜 > 久无互动 > 日常 */
export function pickAmbientPool(hour: number, idleMs: number): PetLinePoolId {
  if (hour >= 23 || hour < 6) return 'late-night';
  if (idleMs >= LONG_IDLE_MS) return 'idle-long';
  return 'ambient';
}

/** 上次互动时间（跨会话保留，用于「长时间未互动」判断） */
function readLastActive(now: number): number {
  try {
    const raw = Number(window.localStorage.getItem(LAST_ACTIVE_KEY));
    return Number.isFinite(raw) && raw > 0 && raw <= now ? raw : now;
  } catch {
    return now;
  }
}

function writeLastActive(at: number): void {
  try {
    window.localStorage.setItem(LAST_ACTIVE_KEY, String(at));
  } catch {
    // 隐私模式/存储禁用：退化为本次会话内计时
  }
}

/**
 * L2 桌宠自主低语：静默 3 分钟后，每 15–25 分钟最多说一句本地短句。
 *
 * - 只在桌宠窗口内运行；不含 TTS，不产生模型调用；
 * - 睡眠 / 说话（voiceState≠idle）/ 勿扰 / 台词开关关闭时静默；
 * - 指针活动会顺延静默计时，用户正在逗它时不会「自言自语」；
 * - v3.0 M1：按深夜 / 久无互动 / 日常分层选池。
 */
export function usePetAmbientTalk(args: PetAmbientTalkArgs): void {
  const argsRef = React.useRef(args);
  argsRef.current = args;
  const lastActiveRef = React.useRef(readLastActive(Date.now()));
  const persistedAtRef = React.useRef(lastActiveRef.current);
  const nextAtRef = React.useRef(Date.now() + AMBIENT_IDLE_BEFORE_MS);
  const spokenAtRef = React.useRef<number[]>([]);

  React.useEffect(() => {
    const touch = (now: number) => {
      lastActiveRef.current = now;
      if (now - persistedAtRef.current >= PERSIST_THROTTLE_MS) {
        persistedAtRef.current = now;
        writeLastActive(now);
      }
    };
    const onActivity = () => touch(Date.now());
    window.addEventListener('pointerdown', onActivity, { passive: true });
    window.addEventListener('pointermove', onActivity, { passive: true });

    const timer = window.setInterval(() => {
      const a = argsRef.current;
      if (!a.enabled || a.sleeping || a.voiceState !== 'idle' || a.work === 'busy') return;
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
      const hour = a.hour?.() ?? new Date(now).getHours();
      const pool = pickAmbientPool(hour, now - lastActiveRef.current);
      a.speak(a.t(pickPetLine(pool)), 3600);
    }, CHECK_MS);

    return () => {
      window.removeEventListener('pointerdown', onActivity);
      window.removeEventListener('pointermove', onActivity);
      window.clearInterval(timer);
      writeLastActive(lastActiveRef.current);
    };
  }, []);
}
