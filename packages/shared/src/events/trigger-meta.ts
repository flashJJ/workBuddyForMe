/**
 * v1.7 内置触发器元数据（M3）。
 *
 * 与剧本定义解耦：EventDefinition 只描述「怎么演」，本文件描述「何时演」。
 * 触发判定纯本地：意图由 web 触发器识别（消息关键词/情绪信号/UI 总线/本地状态机），
 * 不触网、不调工具。when 是与剧本 branch 同文法的 AND 附加条件（如早安时段）。
 */
import type { EventCondition } from '../schemas/event';

/** 内置意图白名单（与 02-剧本初稿 trigger.intent 一一对应） */
export const BUILT_IN_EVENT_INTENTS = [
  'firstDailyInteraction',
  'goodnight',
  'reunion',
  'praise',
  'headTouchStreak',
  'comfortAfterBelittle',
  'taskRunSuccess',
  'taskRunFailure',
] as const;
export type BuiltInEventIntent = (typeof BUILT_IN_EVENT_INTENTS)[number];

export interface BuiltInTriggerSpec {
  eventId: string;
  intent: BuiltInEventIntent;
  /** 附加 AND 条件（触发时随上下文求值；跨夜 OR 等复杂时段由触发器代码处理） */
  when?: EventCondition[];
  /** 仅 UI 会话消费：api/mcp/远端触发不演（任务族） */
  uiOnly?: boolean;
}

export const BUILT_IN_TRIGGERS: readonly BuiltInTriggerSpec[] = [
  {
    eventId: 'ev.greeting.morning',
    intent: 'firstDailyInteraction',
    when: [
      { path: 'counters.interactionsToday', op: 'eq', value: 0 },
      { path: 'time.hour', op: 'gte', value: 5 },
      { path: 'time.hour', op: 'lt', value: 11 },
    ],
  },
  { eventId: 'ev.greeting.night', intent: 'goodnight' },
  { eventId: 'ev.greeting.welcome', intent: 'reunion' },
  { eventId: 'ev.relation.praised', intent: 'praise' },
  {
    eventId: 'ev.touch.shy',
    intent: 'headTouchStreak',
    when: [{ path: 'counters.touchStreak', op: 'gte', value: 3 }],
  },
  { eventId: 'ev.relation.comfort', intent: 'comfortAfterBelittle' },
  { eventId: 'ev.task.success', intent: 'taskRunSuccess', uiOnly: true },
  { eventId: 'ev.task.failure', intent: 'taskRunFailure', uiOnly: true },
];

const INTENT_TO_EVENT: ReadonlyMap<BuiltInEventIntent, string> = new Map(
  BUILT_IN_TRIGGERS.map((spec) => [spec.intent, spec.eventId]),
);

export function eventIdForIntent(intent: BuiltInEventIntent): string | null {
  return INTENT_TO_EVENT.get(intent) ?? null;
}

export function getTriggerSpec(eventId: string): BuiltInTriggerSpec | null {
  return BUILT_IN_TRIGGERS.find((spec) => spec.eventId === eventId) ?? null;
}

/**
 * 本地短语包含匹配词表（lowercase + trim，非正则；v025 自定义短语同口径）。
 * 放在 shared：中英文词表随剧本走，core/web 都可读，单测锁定命中口径。
 */
export const GOODNIGHT_PHRASES: readonly string[] = [
  '晚安',
  '睡了',
  '睡觉了',
  '睡啦',
  '去睡',
  '要睡了',
  '休息吧',
  '睡覺',
  'good night',
  'goodnight',
  'going to bed',
  'gn',
];

/** belittle 后 30min 内的安慰意图短语 */
export const COMFORT_PHRASES: readonly string[] = [
  '别生气',
  '不要生气',
  '不气',
  '对不起',
  '抱歉',
  '不好意思',
  '原谅我',
  '摸摸',
  '安慰',
  "i'm sorry",
  'forgive me',
  'don’t be angry',
];
