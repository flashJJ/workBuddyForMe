/**
 * v1.6 情绪内核纯函数：与 DB/React 无关，全部可注入时钟、可单测。
 *
 * 分层：mood（临时情绪，指数衰减）/ relation（慢变量，只随事件小步增长）。
 * 数值真源在 @wbfm/shared/constants/emotion；本文件只做状态演算，
 * 任何写入路径都必须先过 normalizeEmotionState（坏数据回落默认值，不抛错）。
 */
import {
  DEFAULT_ANGER,
  DEFAULT_HAPPINESS,
  DEFAULT_INTIMACY,
  DEFAULT_SADNESS,
  DEFAULT_TRUST,
  EMOTION_EVENT_DELTAS,
  EMOTION_EVENT_DESCRIPTION_MAX,
  EMOTION_SCHEMA_VERSION,
  MOOD_DECAY_FACTOR_PER_MINUTE,
  MOOD_HAPPINESS_MAX,
  MOOD_HAPPINESS_MIN,
  MOOD_VALUE_MAX,
  MOOD_VALUE_MIN,
  RECENT_EMOTION_EVENTS_LIMIT,
  RELATION_MAX,
  RELATION_MIN,
} from '@wbfm/shared/constants';
import {
  createDefaultEmotionState,
  EMOTION_EVENT_SOURCES,
  EMOTION_NEEDS,
  SOUL_EVENT_TYPES,
  type EmotionEvent,
  type EmotionEventSource,
  type EmotionNeed,
  type EmotionState,
  type SoulEventType,
} from '@wbfm/shared/schemas';

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** 增量累加后统一保留 3 位小数，避免 0.1 进制浮点尾差落库 */
function round3(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readNumber(
  value: unknown,
  fallback: number,
  min: number,
  max: number,
): number {
  return typeof value === 'number' && Number.isFinite(value)
    ? clamp(value, min, max)
    : fallback;
}

function readTimestamp(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : fallback;
}

function isEnumValue<T extends readonly string[]>(
  value: unknown,
  values: T,
): value is T[number] {
  return typeof value === 'string' && (values as readonly string[]).includes(value);
}

function normalizeEvent(value: unknown, now: number): EmotionEvent | null {
  if (!isRecord(value)) return null;
  if (!isEnumValue(value.type, SOUL_EVENT_TYPES)) return null;
  if (!isEnumValue(value.source, EMOTION_EVENT_SOURCES)) return null;
  const description =
    typeof value.description === 'string'
      ? value.description.trim().slice(0, EMOTION_EVENT_DESCRIPTION_MAX)
      : undefined;
  return {
    id: typeof value.id === 'string' && value.id ? value.id : createEventId(),
    type: value.type,
    source: value.source,
    timestamp: readTimestamp(value.timestamp, now),
    ...(description ? { description } : {}),
  };
}

function createEventId(): string {
  return globalThis.crypto?.randomUUID?.()
    ?? `emotion-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

/**
 * 把任意输入归一化为合法 EmotionState：字段缺失/越界/坏事件全部回落，
 * 结构版本不匹配时也只做兼容映射（当前只有 v1，未来版本在此分支升级）。
 */
export function normalizeEmotionState(value: unknown, now: number): EmotionState {
  const source: Record<string, unknown> = isRecord(value) ? value : {};
  const mood = isRecord(source.mood) ? source.mood : {};
  const relation = isRecord(source.relation) ? source.relation : {};
  const rawCounters = isRecord(source.counters) ? source.counters : {};

  const counters: Record<string, number> = {};
  for (const [key, counter] of Object.entries(rawCounters)) {
    if (typeof counter === 'number' && Number.isFinite(counter)) counters[key] = counter;
  }

  const recentEvents = Array.isArray(source.recentEvents)
    ? source.recentEvents
        .map((event) => normalizeEvent(event, now))
        .filter((event): event is EmotionEvent => event !== null)
        .slice(-RECENT_EMOTION_EVENTS_LIMIT)
    : [];

  const schemaVersion = EMOTION_SCHEMA_VERSION;
  const base = createDefaultEmotionState(now);
  return {
    schemaVersion,
    mood: {
      happiness: readNumber(
        mood.happiness,
        DEFAULT_HAPPINESS,
        MOOD_HAPPINESS_MIN,
        MOOD_HAPPINESS_MAX,
      ),
      anger: readNumber(mood.anger, DEFAULT_ANGER, MOOD_VALUE_MIN, MOOD_VALUE_MAX),
      sadness: readNumber(mood.sadness, DEFAULT_SADNESS, MOOD_VALUE_MIN, MOOD_VALUE_MAX),
    },
    relation: {
      intimacy: readNumber(
        relation.intimacy,
        DEFAULT_INTIMACY,
        RELATION_MIN,
        RELATION_MAX,
      ),
      trust: readNumber(relation.trust, DEFAULT_TRUST, RELATION_MIN, RELATION_MAX),
    },
    currentNeed: isEnumValue(source.currentNeed, EMOTION_NEEDS)
      ? source.currentNeed
      : ('none' satisfies EmotionNeed),
    counters,
    recentEvents,
    updatedAt: readTimestamp(source.updatedAt, base.updatedAt),
  };
}

export interface CreateEmotionEventInput {
  type: SoulEventType;
  source: EmotionEventSource;
  timestamp?: number;
  description?: string;
}

/** 构造一条合法情绪事件（id 自动生成，description 截断） */
export function createEmotionEvent(input: CreateEmotionEventInput): EmotionEvent {
  const event = normalizeEvent(
    {
      id: createEventId(),
      type: input.type,
      source: input.source,
      timestamp: input.timestamp ?? Date.now(),
      ...(input.description ? { description: input.description } : {}),
    },
    input.timestamp ?? Date.now(),
  );
  // 入参枚举由类型系统保证合法，normalizeEvent 不会返回 null
  if (!event) throw new Error('非法情绪事件入参');
  return event;
}

/**
 * 施加一个情绪事件：按增量表更新 mood/relation（夹值域）、登记最近事件、
 * 更新时间戳为事件时刻。输入状态先归一化，输出保证合法。
 */
export function applyEmotionEvent(state: EmotionState, event: EmotionEvent): EmotionState {
  const normalized = normalizeEmotionState(state, event.timestamp);
  const delta = EMOTION_EVENT_DELTAS[event.type];
  const next = structuredClone(normalized);
  next.mood.happiness = round3(
    clamp(normalized.mood.happiness + delta.happiness, MOOD_HAPPINESS_MIN, MOOD_HAPPINESS_MAX),
  );
  next.mood.anger = round3(
    clamp(normalized.mood.anger + delta.anger, MOOD_VALUE_MIN, MOOD_VALUE_MAX),
  );
  next.mood.sadness = round3(
    clamp(normalized.mood.sadness + delta.sadness, MOOD_VALUE_MIN, MOOD_VALUE_MAX),
  );
  next.relation.intimacy = round3(
    clamp(normalized.relation.intimacy + delta.intimacy, RELATION_MIN, RELATION_MAX),
  );
  next.relation.trust = round3(
    clamp(normalized.relation.trust + delta.trust, RELATION_MIN, RELATION_MAX),
  );
  next.recentEvents = [...normalized.recentEvents, event].slice(-RECENT_EMOTION_EVENTS_LIMIT);
  next.updatedAt = event.timestamp;
  return next;
}

/**
 * 按离线时长对 mood 做指数衰减（value × factor^elapsedMinutes）。
 * 关系不衰减；非正时长返回等价副本（不动状态）。衰减是读时惰性计算，
 * 调用方决定是否把结果写回（record 路径写回，纯展示路径只读）。
 */
export function decayEmotionState(
  state: EmotionState,
  elapsedMs: number,
  now: number,
): EmotionState {
  const normalized = normalizeEmotionState(state, now);
  if (!Number.isFinite(elapsedMs) || elapsedMs <= 0) {
    return structuredClone(normalized);
  }
  const minutes = elapsedMs / 60_000;
  const next = structuredClone(normalized);
  next.mood.happiness = round3(
    clamp(
      normalized.mood.happiness * MOOD_DECAY_FACTOR_PER_MINUTE.happiness ** minutes,
      MOOD_HAPPINESS_MIN,
      MOOD_HAPPINESS_MAX,
    ),
  );
  next.mood.anger = round3(
    clamp(
      normalized.mood.anger * MOOD_DECAY_FACTOR_PER_MINUTE.anger ** minutes,
      MOOD_VALUE_MIN,
      MOOD_VALUE_MAX,
    ),
  );
  next.mood.sadness = round3(
    clamp(
      normalized.mood.sadness * MOOD_DECAY_FACTOR_PER_MINUTE.sadness ** minutes,
      MOOD_VALUE_MIN,
      MOOD_VALUE_MAX,
    ),
  );
  next.updatedAt = now;
  return next;
}

/** 便捷封装：构造事件并立即施加（供 service/测试使用） */
export function recordEmotion(
  state: EmotionState,
  input: CreateEmotionEventInput,
): EmotionState {
  return applyEmotionEvent(
    state,
    createEmotionEvent({ ...input, timestamp: input.timestamp ?? Date.now() }),
  );
}
