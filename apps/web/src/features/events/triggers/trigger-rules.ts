/**
 * v1.7 内置触发意图的纯判定规则（无 React/网络，单测锁定口径）。
 *
 * 意图识别全部本地：消息关键词 + 时段 + 情绪信号 + 本地计数器；
 * 准入闸门（总开关/勿扰/冷却/对话锁）在 director，本模块只回答「这条输入想触发谁」。
 */
import type { ReunionTier, SoulEventType } from '@wbfm/shared/schemas';
import { COMFORT_PHRASES, GOODNIGHT_PHRASES } from '@wbfm/shared/events';
import { matchAnyPhrase } from './phrase-match';

/** 早安时段：[5, 11)（本地小时） */
export const MORNING_HOUR_MIN = 5;
export const MORNING_HOUR_MAX = 11;
/** belittle 后安慰窗口：30min */
export const COMFORT_AFTER_BELITTLE_MS = 30 * 60_000;

export function isMorningHour(hour: number): boolean {
  return hour >= MORNING_HOUR_MIN && hour < MORNING_HOUR_MAX;
}

/** 晚安时段：22:00–次日 5:00（跨夜）；无意图即使深夜也不主动播 */
export function isNightHour(hour: number): boolean {
  return hour >= 22 || hour < MORNING_HOUR_MIN;
}

/** 用户消息可触发的意图（互斥/并存均由数组表达，准入层按剧本再闸门） */
export type UserMessageIntent =
  | 'firstDailyInteraction'
  | 'goodnight'
  | 'comfortAfterBelittle';

export interface UserMessageTriggerInput {
  text: string;
  hour: number;
  /** 本条消息计入之前的当日交互数（0 表示今天第一条） */
  interactionsTodayBefore: number;
  /** 最近一次 belittle 情绪信号时刻；null/超窗则安慰意图不成立 */
  lastBelittleAt: number | null;
  now: number;
}

export function resolveUserMessageIntents(input: UserMessageTriggerInput): UserMessageIntent[] {
  const intents: UserMessageIntent[] = [];
  if (input.interactionsTodayBefore === 0 && isMorningHour(input.hour)) {
    intents.push('firstDailyInteraction');
  }
  if (isNightHour(input.hour) && matchAnyPhrase(input.text, GOODNIGHT_PHRASES)) {
    intents.push('goodnight');
  }
  const withinComfortWindow =
    input.lastBelittleAt !== null &&
    input.now - input.lastBelittleAt <= COMFORT_AFTER_BELITTLE_MS &&
    input.now - input.lastBelittleAt >= 0;
  if (withinComfortWindow && matchAnyPhrase(input.text, COMFORT_PHRASES)) {
    intents.push('comfortAfterBelittle');
  }
  return intents;
}

/** v1.6 归来档位（welcome/miss/longMiss）→ 剧本 branch 数值档（0/1/2） */
export const REUNION_TIER_TO_NUMBER: Record<ReunionTier, number> = {
  welcome: 0,
  miss: 1,
  longMiss: 2,
};

/** 助手回复情绪信号 → 事件意图；chat/未知一律 null */
export function resolveSoulEventIntent(
  soulEvent: SoulEventType | undefined,
): 'praise' | 'belittle' | null {
  if (soulEvent === 'praise') return 'praise';
  if (soulEvent === 'belittle') return 'belittle';
  return null;
}
