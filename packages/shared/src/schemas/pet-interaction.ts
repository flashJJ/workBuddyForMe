/**
 * v1.6 M3 触摸交互状态机（纯函数、可注入时钟；rail 与 /pet 共用）。
 *
 * 状态只活在内存（刷新即重置）；日期计数按本地自然日滚动。
 * 随机性由调用方注入（测试可固定），状态机本身不做随机判定以外的副作用。
 */
import {
  HEAD_TOUCH_DEBOUNCE_MS,
  HEAD_TOUCH_PROTECT_MS,
  HEAD_TOUCH_TRIGGER_COUNT,
  HEAD_TOUCH_WINDOW_MS,
  TOUCH_LINE_COOLDOWN_MS,
  TOUCH_LINE_DAILY_CAP,
  TOUCH_LINE_PROBABILITY,
  TOUCH_BLUSH_EXPRESSION,
  TOUCH_PROTECT_EXPRESSION,
  TOUCH_BLUSH_LINE_COUNT,
  TOUCH_PROTECT_LINE_COUNT,
} from '../constants/pet-interaction';
import type { ExpressionTag } from './expression';

export interface TouchState {
  /** 当前连摸窗口的首次触摸时刻（窗口外归零） */
  windowStartAt: number;
  /** 窗口内累计摸头次数 */
  windowCount: number;
  /** 保护期截止时刻（<=now 表示已结束） */
  protectedUntil: number;
  /** 上次有效触摸时刻（防抖） */
  lastTouchAt: number;
  /** 上一条本地短句时刻（0=今天没说过） */
  lastLineAt: number;
  /** 短句计数所属本地日期（YYYY-MM-DD） */
  lineDate: string;
  /** 当日已说短句数 */
  lineCount: number;
}

export function createTouchState(now: number, dateKey: string): TouchState {
  return {
    windowStartAt: 0,
    windowCount: 0,
    protectedUntil: 0,
    lastTouchAt: 0,
    lastLineAt: 0,
    lineDate: dateKey,
    lineCount: 0,
  };
}

export type TouchReaction = 'blush' | 'protect';

export interface TouchOutcome {
  /** 本次触摸是否被接受（防抖窗口外重复点击返回 false） */
  accepted: boolean;
  /** 害羞 或 保护期抗议 */
  reaction: TouchReaction;
  /** 对应的临时表情 */
  expression: ExpressionTag;
  /** 当前是否处于保护期 */
  inProtection: boolean;
  /** 本次是否「新进入」保护期（区别于保护期内的持续抗议；用于只在进入时说一次短句） */
  enteredProtection: boolean;
  /** 本次是否应播放本地短句 */
  speakLine: boolean;
  /** 下一个状态 */
  next: TouchState;
}

function rollLine(state: TouchState, now: number, dateKey: string, random: number): boolean {
  if (state.lineDate !== dateKey) {
    state.lineDate = dateKey;
    state.lineCount = 0;
    state.lastLineAt = 0;
  }
  if (state.lineCount >= TOUCH_LINE_DAILY_CAP) return false;
  if (state.lastLineAt > 0 && now - state.lastLineAt < TOUCH_LINE_COOLDOWN_MS) return false;
  if (random >= TOUCH_LINE_PROBABILITY) return false;
  state.lineCount += 1;
  state.lastLineAt = now;
  return true;
}

/**
 * 施加一次头部触摸。
 * @param random 0..1 随机数（短句判定；测试注入固定值）
 */
export function registerHeadTouch(
  prev: TouchState,
  now: number,
  dateKey: string,
  random: number,
): TouchOutcome {
  // 防抖：距上次有效触摸过近，忽略（不改变任何计数）
  if (prev.lastTouchAt > 0 && now - prev.lastTouchAt < HEAD_TOUCH_DEBOUNCE_MS) {
    return {
      accepted: false,
      reaction: 'blush',
      expression: TOUCH_BLUSH_EXPRESSION,
      inProtection: prev.protectedUntil > now,
      enteredProtection: false,
      speakLine: false,
      next: prev,
    };
  }

  const next: TouchState = {
    ...prev,
    lastTouchAt: now,
    // 跨自然日滚动短句计数
    lineDate: prev.lineDate === dateKey ? prev.lineDate : dateKey,
    lineCount: prev.lineDate === dateKey ? prev.lineCount : 0,
    lastLineAt: prev.lineDate === dateKey ? prev.lastLineAt : 0,
  };

  // 已在保护期：抗议反馈，不重复进入、不说短句
  if (now < prev.protectedUntil) {
    return {
      accepted: true,
      reaction: 'protect',
      expression: TOUCH_PROTECT_EXPRESSION,
      inProtection: true,
      enteredProtection: false,
      speakLine: false,
      next,
    };
  }

  // 连摸窗口：窗口外重新计数
  const inWindow = prev.windowStartAt > 0 && now - prev.windowStartAt <= HEAD_TOUCH_WINDOW_MS;
  next.windowStartAt = inWindow ? prev.windowStartAt : now;
  next.windowCount = inWindow ? prev.windowCount + 1 : 1;

  if (next.windowCount >= HEAD_TOUCH_TRIGGER_COUNT) {
    next.protectedUntil = now + HEAD_TOUCH_PROTECT_MS;
    next.windowStartAt = 0;
    next.windowCount = 0;
    return {
      accepted: true,
      reaction: 'protect',
      expression: TOUCH_PROTECT_EXPRESSION,
      inProtection: true,
      enteredProtection: true,
      speakLine: false,
      next,
    };
  }

  return {
    accepted: true,
    reaction: 'blush',
    expression: TOUCH_BLUSH_EXPRESSION,
    inProtection: false,
    enteredProtection: false,
    speakLine: rollLine(next, now, dateKey, random),
    next,
  };
}

/** 本地日期键（本地时区 YYYY-MM-DD），供调用方传给状态机 */
export function localDateKey(now: number): string {
  const date = new Date(now);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * 按反应与随机数选一条本地短句的 i18n 键（emotion.touch.<reaction><i>）。
 * random 为 0..1；保护期固定从 protect 池选（进入保护期本身即强反馈）。
 */
export function pickTouchLineKey(reaction: TouchReaction, random: number): string {
  const count =
    reaction === 'protect' ? TOUCH_PROTECT_LINE_COUNT : TOUCH_BLUSH_LINE_COUNT;
  const index = Math.min(count - 1, Math.floor(random * count));
  return `emotion.touch.${reaction}${index}`;
}
