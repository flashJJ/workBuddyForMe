/**
 * v1.7 内置剧本注册表（M0 冻结稿转写，见 docs/plan/v1.7/02-剧本初稿.md）。
 *
 * 只含引擎可执行字段（EventDefinition 形状）；触发意图元数据在 trigger-meta.ts
 * 平行存放——trigger 块是触发器备注，不是引擎 step。
 * 模块加载即过 zod：非法内置剧本在 import 期直接失败，绝不带病上线。
 */
import { eventDefinitionSchema, type EventDefinition } from '../schemas/event';
import { RAW_V20_EVENTS } from './built-in-events-v2';

const RAW_BUILT_IN_EVENTS: EventDefinition[] = [
  {
    id: 'ev.greeting.morning',
    titleKey: 'event.greeting.morning.title',
    priority: 1,
    interruptPolicy: 'ignore',
    cooldownMs: 43_200_000,
    maxPerDay: 1,
    speechLock: 'queue',
    builtIn: true,
    emotionOnPlayed: { type: 'praise' },
    steps: [
      { kind: 'spatial', action: 'slideIn' },
      { kind: 'expression', tag: 'joy' },
      { kind: 'fx', id: 'fadeIn' },
      { kind: 'speech', lineKey: 'event.greeting.morning0' },
      { kind: 'wait', ms: 1200 },
      { kind: 'speech', lineKey: 'event.greeting.morning1', tts: false },
      { kind: 'wait', ms: 900 },
      { kind: 'expression', tag: 'neutral' },
    ],
  },
  {
    id: 'ev.greeting.night',
    titleKey: 'event.greeting.night.title',
    priority: 1,
    interruptPolicy: 'ignore',
    cooldownMs: 43_200_000,
    maxPerDay: 1,
    speechLock: 'queue',
    builtIn: true,
    steps: [
      { kind: 'expression', tag: 'neutral' },
      { kind: 'gaze', x: 0, y: 0.3 },
      { kind: 'speech', lineKey: 'event.greeting.night0' },
      { kind: 'wait', ms: 1400 },
      { kind: 'speech', lineKey: 'event.greeting.night1' },
      { kind: 'wait', ms: 800 },
      { kind: 'gaze', x: 0, y: 0 },
      { kind: 'expression', tag: 'neutral' },
    ],
  },
  {
    id: 'ev.greeting.welcome',
    titleKey: 'event.greeting.welcome.title',
    priority: 2,
    interruptPolicy: 'replaceLowerPriority',
    cooldownMs: 28_800_000,
    maxPerDay: 3,
    speechLock: 'queue',
    builtIn: true,
    emotionOnPlayed: { type: 'praise' },
    steps: [
      { kind: 'spatial', action: 'slideIn' },
      { kind: 'fx', id: 'fadeIn' },
      { kind: 'expression', tag: 'joy' },
      { kind: 'branch', when: [{ path: 'counters.reunionTier', op: 'gte', value: 2 }], goto: 9 },
      { kind: 'branch', when: [{ path: 'counters.reunionTier', op: 'gte', value: 1 }], goto: 7 },
      { kind: 'speech', lineKey: 'event.greeting.welcome0' },
      { kind: 'wait', ms: 900 },
      { kind: 'speech', lineKey: 'event.greeting.welcome1' },
      { kind: 'wait', ms: 1200 },
      { kind: 'speech', lineKey: 'event.greeting.welcome2' },
      { kind: 'wait', ms: 1000 },
      { kind: 'expression', tag: 'neutral' },
    ],
  },
  {
    id: 'ev.relation.praised',
    titleKey: 'event.relation.praised.title',
    priority: 1,
    interruptPolicy: 'ignore',
    cooldownMs: 1_800_000,
    maxPerDay: 3,
    speechLock: 'skip',
    builtIn: true,
    emotionOnPlayed: { type: 'praise' },
    steps: [
      { kind: 'fx', id: 'hearts' },
      {
        kind: 'branch',
        when: [{ path: 'personality.tsundere', op: 'gte', value: 0.5 }],
        goto: 6,
      },
      { kind: 'expression', tag: 'joy' },
      { kind: 'speech', lineKey: 'event.relation.praised0' },
      { kind: 'wait', ms: 1500 },
      { kind: 'branch', when: [], goto: 9 },
      { kind: 'expression', tag: 'smirk' },
      { kind: 'gaze', x: -0.6, y: 0.2 },
      { kind: 'speech', lineKey: 'event.relation.praised1' },
      { kind: 'wait', ms: 1500 },
      { kind: 'gaze', x: 0, y: 0 },
      { kind: 'expression', tag: 'neutral' },
    ],
  },
  {
    id: 'ev.touch.shy',
    titleKey: 'event.touch.shy.title',
    priority: 1,
    interruptPolicy: 'ignore',
    cooldownMs: 600_000,
    maxPerDay: 2,
    speechLock: 'skip',
    builtIn: true,
    steps: [
      { kind: 'motion', group: 'tap' },
      { kind: 'expression', tag: 'smirk', durationMs: 2200 },
      { kind: 'fx', id: 'sweat' },
      { kind: 'gaze', x: 0.7, y: 0.35 },
      { kind: 'speech', lineKey: 'event.touch.shy0', tts: false },
      { kind: 'wait', ms: 1300 },
      { kind: 'speech', lineKey: 'event.touch.shy1', tts: false },
      { kind: 'wait', ms: 900 },
      { kind: 'gaze', x: 0, y: 0 },
    ],
  },
  {
    id: 'ev.relation.comfort',
    titleKey: 'event.relation.comfort.title',
    priority: 2,
    interruptPolicy: 'replaceLowerPriority',
    cooldownMs: 21_600_000,
    maxPerDay: 2,
    speechLock: 'queue',
    builtIn: true,
    emotionOnPlayed: { type: 'comfort' },
    steps: [
      { kind: 'expression', tag: 'sadness', durationMs: 900 },
      { kind: 'gaze', x: 0, y: 0.25 },
      { kind: 'speech', lineKey: 'event.relation.comfort0' },
      { kind: 'wait', ms: 1200 },
      { kind: 'expression', tag: 'joy' },
      { kind: 'speech', lineKey: 'event.relation.comfort1' },
      { kind: 'wait', ms: 1400 },
      { kind: 'fx', id: 'hearts' },
      { kind: 'gaze', x: 0, y: 0 },
      { kind: 'expression', tag: 'neutral' },
    ],
  },
  {
    id: 'ev.task.success',
    titleKey: 'event.task.success.title',
    priority: 2,
    interruptPolicy: 'replaceLowerPriority',
    cooldownMs: 300_000,
    maxPerDay: 5,
    speechLock: 'skip',
    builtIn: true,
    emotionOnPlayed: { type: 'praise' },
    steps: [
      { kind: 'spatial', action: 'hop' },
      { kind: 'expression', tag: 'joy' },
      { kind: 'fx', id: 'sparkle' },
      { kind: 'speech', lineKey: 'event.task.success0', tts: false },
      { kind: 'wait', ms: 1600 },
      { kind: 'expression', tag: 'neutral' },
    ],
  },
  {
    id: 'ev.task.failure',
    titleKey: 'event.task.failure.title',
    priority: 3,
    interruptPolicy: 'ignore',
    cooldownMs: 300_000,
    maxPerDay: 5,
    speechLock: 'skip',
    builtIn: true,
    steps: [
      { kind: 'expression', tag: 'neutral' },
      { kind: 'gaze', x: 0, y: 0.2 },
      { kind: 'speech', lineKey: 'event.task.failure0', tts: false },
      { kind: 'wait', ms: 1000 },
      { kind: 'speech', lineKey: 'event.task.failure1', tts: false },
      { kind: 'wait', ms: 1400 },
      { kind: 'gaze', x: 0, y: 0 },
    ],
  },
  // v1.7 八位之后按版本追加（顺序即 UI 展示顺序）
  ...RAW_V20_EVENTS,
];

/** 内置剧本（模块加载期 zod 全量校验；顺序即 UI 展示顺序） */
export const BUILT_IN_EVENTS: readonly EventDefinition[] = RAW_BUILT_IN_EVENTS.map((raw) =>
  eventDefinitionSchema.parse(raw),
);

const BUILT_IN_EVENT_MAP: ReadonlyMap<string, EventDefinition> = new Map(
  BUILT_IN_EVENTS.map((def) => [def.id, def]),
);

export function getBuiltInEvent(eventId: string): EventDefinition | null {
  return BUILT_IN_EVENT_MAP.get(eventId) ?? null;
}
