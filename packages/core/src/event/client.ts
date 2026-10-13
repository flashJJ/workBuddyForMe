/**
 * v1.7 事件引擎客户端 barrel（浏览器安全）。
 *
 * 与 event/index.ts 的区别：后者另含 event-usage-service（依赖 @wbfm/database，
 * 仅服务端）；本入口只导出纯逻辑引擎，tsup 打独立包 dist/event-client.*，
 * 避免生产构建经根 barrel 把 better-sqlite3/@napi-rs/canvas 拖进客户端图。
 */
export { EventRunner, type EventRunnerDeps } from './runner';
export {
  EventDirector,
  DEFAULT_QUIET,
  type EventDirectorDeps,
  type DirectorSettings,
  type TriggerDecision,
  type EventUsageStore,
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
