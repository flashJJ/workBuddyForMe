/** v1.7 剧情事件引擎 barrel（core 侧） */
export { EventRunner, type EventRunnerDeps } from './runner';
export {
  EventDirector,
  DEFAULT_QUIET,
  type EventDirectorDeps,
  type DirectorSettings,
  type TriggerDecision,
} from './director';
export {
  evaluateEventCondition,
  evaluateEventConditions,
  isValidConditionPath,
  readConditionValue,
} from './conditions';
export { isQuietHour, effectiveCooldown } from './gates';
export { createWallClock, createManualClock, type EventClock } from './clock';
export { InMemoryEventUsageStore, defaultDateKey } from './usage-store';
export type {
  ConditionContext,
  EventEffectSink,
  EventRunGates,
  EventUsageReader,
  EventUsageWriter,
  EventRunResult,
  PersonalityWeights,
  QueuedEvent,
} from './types';
