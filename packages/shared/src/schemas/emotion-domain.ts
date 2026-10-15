/**
 * v1.6 情绪契约域 barrel（schemas/index.ts 行数门禁拆分）：
 * 状态/事件/信号 schema、等级分级与尾块文本解析统一从本面公开。
 */
export {
  SOUL_EVENT_TYPES,
  EMOTION_NEEDS,
  EMOTION_EVENT_SOURCES,
  EMOTION_PERSISTED_EVENT_TYPES,
  MOOD_LEVELS,
  RELATION_LEVELS,
  emotionMoodSchema,
  emotionRelationSchema,
  emotionEventSchema,
  emotionStateSchema,
  emotionSignalSchema,
  createDefaultEmotionState,
  moodLevelOf,
  relationLevelOf,
  type SoulEventType,
  type EmotionNeed,
  type EmotionEventSource,
  type EmotionPersistedEventType,
  type EmotionMood,
  type EmotionRelation,
  type EmotionEvent,
  type EmotionEventView,
  type EmotionState,
  type EmotionSignal,
  type MoodLevel,
  type RelationLevel,
} from './emotion';
export { extractEmotionSignal, stripEmotionSignalBlock } from './emotion-signal-text';
export {
  baselineExpression,
  fuseExpression,
  type FusedExpression,
} from './emotion-expression';
export {
  createTouchState,
  registerHeadTouch,
  localDateKey,
  pickTouchLineKey,
  type TouchState,
  type TouchOutcome,
  type TouchReaction,
} from './pet-interaction';
export {
  decideReunion,
  pickReunionLineKey,
  REUNION_TIER_EXPRESSION,
  type ReunionInput,
  type ReunionDecision,
  type ReunionTier,
  type ReunionMemory,
} from './reunion';
