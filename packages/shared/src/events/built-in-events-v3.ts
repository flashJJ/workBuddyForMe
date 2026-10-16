/**
 * v2.0 M3 主动感知 2.0 内置剧本（连续工作/深夜仍活跃/久未对话）。
 * 从 built-in-events.ts 按业务域拆出（行数门禁）；zod 校验在聚合入口统一执行。
 *
 * 共同纪律：
 * - 仅由本地上下文状态机边沿触发（context-triggers.ts 封闭枚举），无短语/意图映射；
 * - 均无 emotionOnPlayed——关怀演出不反灌情绪，避免自激循环；
 * - 频率档/勿扰/总开关/出口/对话锁全部走 EventDirector 既有闸门。
 */
import type { EventDefinition } from '../schemas/event';

export const RAW_V20_M3_EVENTS: EventDefinition[] = [
  // ── 深夜仍活跃（23:00–5:00；同一夜晚仅一次） ──
  {
    id: 'ev.context.latenight',
    titleKey: 'event.context.latenight.title',
    priority: 1,
    interruptPolicy: 'ignore',
    cooldownMs: 12 * 3600_000,
    maxPerDay: 1,
    speechLock: 'queue',
    builtIn: true,
    steps: [
      { kind: 'expression', tag: 'neutral' },
      { kind: 'gaze', x: 0, y: 0.3 },
      { kind: 'speech', lineKey: 'event.context.latenight0' },
      { kind: 'wait', ms: 1300 },
      { kind: 'speech', lineKey: 'event.context.latenight1', tts: false },
      { kind: 'expression', tag: 'neutral' },
    ],
  },
  // ── 连续工作 90 分钟（空闲断口 >5min 重新计时；本段仅一次） ──
  {
    id: 'ev.context.workstreak',
    titleKey: 'event.context.workstreak.title',
    priority: 1,
    interruptPolicy: 'ignore',
    cooldownMs: 2 * 3600_000,
    maxPerDay: 2,
    speechLock: 'queue',
    builtIn: true,
    steps: [
      { kind: 'gaze', x: 0, y: 0.3 },
      { kind: 'expression', tag: 'neutral' },
      { kind: 'speech', lineKey: 'event.context.workstreak0' },
      { kind: 'wait', ms: 1200 },
      { kind: 'speech', lineKey: 'event.context.workstreak1', tts: false },
      { kind: 'wait', ms: 900 },
      { kind: 'gaze', x: 0, y: 0 },
      { kind: 'expression', tag: 'neutral' },
    ],
  },
  // ── 久未对话（≥3 天无对话且当下在电脑前；同一段无对话间隔仅一次） ──
  {
    id: 'ev.context.longnochat',
    titleKey: 'event.context.longnochat.title',
    priority: 2,
    interruptPolicy: 'replaceLowerPriority',
    cooldownMs: 24 * 3600_000,
    maxPerDay: 1,
    speechLock: 'queue',
    builtIn: true,
    steps: [
      { kind: 'spatial', action: 'slideIn' },
      { kind: 'fx', id: 'fadeIn' },
      { kind: 'expression', tag: 'joy' },
      { kind: 'speech', lineKey: 'event.context.longnochat0' },
      { kind: 'wait', ms: 1200 },
      { kind: 'expression', tag: 'neutral' },
    ],
  },
];
