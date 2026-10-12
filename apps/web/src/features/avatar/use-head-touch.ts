'use client';

import * as React from 'react';
import {
  createTouchState,
  localDateKey,
  pickTouchLineKey,
  registerHeadTouch,
  type TouchState,
} from '@wbfm/shared/schemas';
import type { MessageKey } from '@wbfm/shared/i18n';
import { TOUCH_BLUSH_MS } from '@wbfm/shared/constants';
import type { ExpressionTag } from './expression-parser';

/** controller 只需要摸头反馈用到的三个动作 */
export interface TouchControllerLike {
  playSquash(): void;
  flashExpression(tag: ExpressionTag, durationMs: number): void;
}

export interface HeadTouchResult {
  /** 防抖拒绝（重复点击）时 false，调用方可忽略 */
  accepted: boolean;
  inProtection: boolean;
  expression: ExpressionTag;
  /** 应展示的本地短句 i18n 键（无则 null） */
  lineKey: MessageKey | null;
}

export interface UseHeadTouchOptions {
  /** 本地短句回调（pet 传字幕气泡；rail 可不传，仅表情反馈） */
  onLine?: (key: MessageKey) => void;
  /** 注入时钟/随机（测试用） */
  now?: () => number;
  random?: () => number;
}

/**
 * 头部摸头交互：连摸窗口/保护期/短句节流的纯状态机（shared）+ 渲染动作。
 * 状态仅存 ref（不触发渲染），刷新页面即重置。
 */
export function useHeadTouch(
  controllerRef: React.RefObject<TouchControllerLike | null>,
  options: UseHeadTouchOptions = {},
): ((nowOverride?: number) => HeadTouchResult) {
  const stateRef = React.useRef<TouchState | null>(null);
  const optionsRef = React.useRef(options);
  optionsRef.current = options;

  return React.useCallback((nowOverride?: number) => {
    const now = nowOverride ?? optionsRef.current.now?.() ?? Date.now();
    if (!stateRef.current) stateRef.current = createTouchState(now, localDateKey(now));
    const random = optionsRef.current.random?.() ?? Math.random();
    const outcome = registerHeadTouch(stateRef.current, now, localDateKey(now), random);
    stateRef.current = outcome.next;

    if (!outcome.accepted) {
      return {
        accepted: false,
        inProtection: outcome.inProtection,
        expression: outcome.expression,
        lineKey: null,
      };
    }

    const controller = controllerRef.current;
    controller?.playSquash();
    controller?.flashExpression(outcome.expression, TOUCH_BLUSH_MS);

    // 仅「新进入保护期」固定一句抗议；普通摸头按状态机概率给害羞短句；
    // 保护期内的持续触摸不说话（防刷屏）。
    let lineKey: MessageKey | null = null;
    if (outcome.speakLine || outcome.enteredProtection) {
      lineKey = pickTouchLineKey(outcome.reaction, random) as MessageKey;
      optionsRef.current.onLine?.(lineKey);
    }
    return {
      accepted: true,
      inProtection: outcome.inProtection,
      expression: outcome.expression,
      lineKey,
    };
  }, [controllerRef]);
}
