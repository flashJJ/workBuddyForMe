/**
 * v1.6 情绪/关系数值契约（M0 评审稿）。
 *
 * 机制为 Servant SoulState 的净室适配：情绪（mood）是会自然平复的临时量，
 * 关系（relation）是慢变量，二者分层；所有调校只允许改本文件的具名常量，
 * 禁止在 core/web 里散落魔法数。真机一轮后允许整体重标定，但须同步本文件与协议文档。
 */

/** 状态 JSON 结构版本（assistant_emotion_states.schema_version） */
export const EMOTION_SCHEMA_VERSION = 1;

// ── 值域 ────────────────────────────────────────────────
/** happiness 允许负值（低落）；anger/sadness 为单向非负量 */
export const MOOD_HAPPINESS_MIN = -100;
export const MOOD_HAPPINESS_MAX = 100;
export const MOOD_VALUE_MIN = 0;
export const MOOD_VALUE_MAX = 100;
export const RELATION_MIN = 0;
export const RELATION_MAX = 100;

// ── 初值 ────────────────────────────────────────────────
export const DEFAULT_HAPPINESS = 10;
export const DEFAULT_ANGER = 0;
export const DEFAULT_SADNESS = 0;
export const DEFAULT_INTIMACY = 20;
export const DEFAULT_TRUST = 30;

/**
 * 单事件增量（LLM 回流 soulEvent 或规则保底命中时施加一次）。
 * 刻意保持小步增长：一次普通聊天只 +0.25 亲密度，关系以周为单位养成。
 */
export const EMOTION_EVENT_DELTAS = {
  praise: { happiness: 8, anger: 0, sadness: 0, intimacy: 2, trust: 1 },
  chat: { happiness: 0, anger: 0, sadness: 0, intimacy: 0.25, trust: 0.1 },
  belittle: { happiness: -6, anger: 8, sadness: 3, intimacy: -1, trust: -2 },
} as const;

/**
 * 情绪指数衰减（读取时按离线分钟数惰性计算：value × factor^elapsedMinutes）。
 * factor 越小平复越快：生气 0.97（消气最快）< 开心 0.98 < 难过 0.995（平复最慢）。
 * 首版数值沿用适配源，真机一轮后集中重标定。
 */
export const MOOD_DECAY_FACTOR_PER_MINUTE = {
  happiness: 0.98,
  anger: 0.97,
  sadness: 0.995,
} as const;

// ── 事件流水 ────────────────────────────────────────────
export const RECENT_EMOTION_EVENTS_LIMIT = 10;
export const EMOTION_EVENT_DESCRIPTION_MAX = 240;

// ── 本轮情绪信号（模型尾块 JSON） ───────────────────────
export const EMOTION_INTENSITY_MIN = 0;
export const EMOTION_INTENSITY_MAX = 1;
/** 模型未给 intensity 时的默认强度 */
export const DEFAULT_EMOTION_INTENSITY = 0.6;
/**
 * 表情权重展示地板：映射 Live2D expression 设置权重，低于该值也抬到此值，
 * 保证模型给的情绪「看得见」（微弱情绪只在持续时长上缩短，不靠隐形权重表达）。
 */
export const MIN_EXPRESSION_WEIGHT = 0.55;

// ── 等级文案阈值（UI 与模型注入共用同一份分级，避免口径漂移） ──
/** 正向情绪分级（含 happiness 正极）：>= 阈值取该档 */
export const MOOD_POSITIVE_LEVEL_THRESHOLDS = {
  strong: 70,
  evident: 40,
  slight: 15,
} as const;
/** happiness 负极分级：< 0 时使用，<= veryLow 为明显低落 */
export const MOOD_NEGATIVE_LEVEL_THRESHOLD = -40;
/** 关系分级：>= 阈值取该档 */
export const RELATION_LEVEL_THRESHOLDS = {
  veryHigh: 80,
  high: 55,
  building: 30,
} as const;
