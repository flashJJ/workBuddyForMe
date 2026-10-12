/**
 * v1.6 情绪内核契约（M0）。
 *
 * 三层形态：
 * - {@link EmotionState}：每助手一行的持久化状态（情绪 + 关系 + 需求 + 计数器 + 最近事件）；
 * - {@link EmotionEvent}：状态变迁事件（模型回流 / 规则保底 / 剧情 / 手动）；
 * - {@link EmotionSignal}：模型单轮回复尾块 JSON 的容错结构（词表外一律回落，永不炸主回复）。
 *
 * 归一化（夹值域/坏数据回落/事件截断）在 core 情绪内核完成；本文件只提供契约与
 * 无副作用的等级分级函数，UI 文案与模型注入文案共用同一分级口径。
 */
import { z } from 'zod';
import { EXPRESSION_TAGS } from './expression';
import {
  DEFAULT_ANGER,
  DEFAULT_EMOTION_INTENSITY,
  DEFAULT_HAPPINESS,
  DEFAULT_INTIMACY,
  DEFAULT_SADNESS,
  DEFAULT_TRUST,
  EMOTION_EVENT_DESCRIPTION_MAX,
  EMOTION_INTENSITY_MAX,
  EMOTION_INTENSITY_MIN,
  EMOTION_SCHEMA_VERSION,
  MOOD_HAPPINESS_MAX,
  MOOD_HAPPINESS_MIN,
  MOOD_NEGATIVE_LEVEL_THRESHOLD,
  MOOD_POSITIVE_LEVEL_THRESHOLDS,
  MOOD_VALUE_MAX,
  MOOD_VALUE_MIN,
  RECENT_EMOTION_EVENTS_LIMIT,
  RELATION_LEVEL_THRESHOLDS,
  RELATION_MAX,
  RELATION_MIN,
} from '../constants/emotion';

// ── 枚举 ────────────────────────────────────────────────
export const SOUL_EVENT_TYPES = ['praise', 'chat', 'belittle'] as const;
export type SoulEventType = (typeof SOUL_EVENT_TYPES)[number];

export const EMOTION_NEEDS = ['none', 'attention', 'comfort', 'play', 'rest'] as const;
export type EmotionNeed = (typeof EMOTION_NEEDS)[number];

/** 情绪事件的产生来源：决定可信度与 UI 展示 */
export const EMOTION_EVENT_SOURCES = ['model', 'rule', 'event', 'manual'] as const;
export type EmotionEventSource = (typeof EMOTION_EVENT_SOURCES)[number];

// ── 状态结构 ────────────────────────────────────────────
export const emotionMoodSchema = z.object({
  happiness: z.number().min(MOOD_HAPPINESS_MIN).max(MOOD_HAPPINESS_MAX),
  anger: z.number().min(MOOD_VALUE_MIN).max(MOOD_VALUE_MAX),
  sadness: z.number().min(MOOD_VALUE_MIN).max(MOOD_VALUE_MAX),
});

export const emotionRelationSchema = z.object({
  intimacy: z.number().min(RELATION_MIN).max(RELATION_MAX),
  trust: z.number().min(RELATION_MIN).max(RELATION_MAX),
});

export const emotionEventSchema = z.object({
  id: z.string().min(1),
  type: z.enum(SOUL_EVENT_TYPES),
  source: z.enum(EMOTION_EVENT_SOURCES),
  timestamp: z.number().int().nonnegative(),
  description: z.string().max(EMOTION_EVENT_DESCRIPTION_MAX).optional(),
});

/**
 * 持久化状态。counters 为 v1.7 剧本 branch 条件预留的命名计数器
 * （如连续摸头次数、当日交互次数），v1.6 只保证读写不丢。
 */
export const emotionStateSchema = z.object({
  schemaVersion: z.literal(EMOTION_SCHEMA_VERSION),
  mood: emotionMoodSchema,
  relation: emotionRelationSchema,
  currentNeed: z.enum(EMOTION_NEEDS),
  counters: z.record(z.string(), z.number()),
  recentEvents: z.array(emotionEventSchema).max(RECENT_EMOTION_EVENTS_LIMIT),
  updatedAt: z.number().int().nonnegative(),
});

export type EmotionMood = z.infer<typeof emotionMoodSchema>;
export type EmotionRelation = z.infer<typeof emotionRelationSchema>;
export type EmotionEvent = z.infer<typeof emotionEventSchema>;
export type EmotionState = z.infer<typeof emotionStateSchema>;

export function createDefaultEmotionState(now: number): EmotionState {
  return {
    schemaVersion: EMOTION_SCHEMA_VERSION,
    mood: { happiness: DEFAULT_HAPPINESS, anger: DEFAULT_ANGER, sadness: DEFAULT_SADNESS },
    relation: { intimacy: DEFAULT_INTIMACY, trust: DEFAULT_TRUST },
    currentNeed: 'none',
    counters: {},
    recentEvents: [],
    updatedAt: now,
  };
}

// ── 模型单轮情绪信号（容错协议） ─────────────────────────
/**
 * 模型回复尾块 JSON：{ "emotion": "joy", "intensity": 0.7, "soulEvent": "praise" }。
 * 每个叶子都带 .catch 默认值：词表外/越界/类型错都回落而不是整体拒绝，
 * 根节点不是对象时由 core 走规则保底（弱模型协议遵从率不可假设）。
 */
export const emotionSignalSchema = z.object({
  emotion: z.enum(EXPRESSION_TAGS).catch('neutral'),
  intensity: z
    .number()
    .min(EMOTION_INTENSITY_MIN)
    .max(EMOTION_INTENSITY_MAX)
    .catch(DEFAULT_EMOTION_INTENSITY),
  soulEvent: z.enum(SOUL_EVENT_TYPES).catch('chat'),
});

export type EmotionSignal = z.infer<typeof emotionSignalSchema>;

// ── 等级分级（UI 与模型注入共用口径） ────────────────────
export const MOOD_LEVELS = ['veryLow', 'low', 'none', 'slight', 'evident', 'strong'] as const;
export type MoodLevel = (typeof MOOD_LEVELS)[number];

export const RELATION_LEVELS = ['low', 'building', 'high', 'veryHigh'] as const;
export type RelationLevel = (typeof RELATION_LEVELS)[number];

/**
 * 情绪量 → 等级。happiness 是双极量（负=低落），anger/sadness 为非负量。
 */
export function moodLevelOf(value: number): MoodLevel {
  if (value < 0) {
    return value <= MOOD_NEGATIVE_LEVEL_THRESHOLD ? 'veryLow' : 'low';
  }
  if (value >= MOOD_POSITIVE_LEVEL_THRESHOLDS.strong) return 'strong';
  if (value >= MOOD_POSITIVE_LEVEL_THRESHOLDS.evident) return 'evident';
  if (value >= MOOD_POSITIVE_LEVEL_THRESHOLDS.slight) return 'slight';
  return 'none';
}

export function relationLevelOf(value: number): RelationLevel {
  if (value >= RELATION_LEVEL_THRESHOLDS.veryHigh) return 'veryHigh';
  if (value >= RELATION_LEVEL_THRESHOLDS.high) return 'high';
  if (value >= RELATION_LEVEL_THRESHOLDS.building) return 'building';
  return 'low';
}
