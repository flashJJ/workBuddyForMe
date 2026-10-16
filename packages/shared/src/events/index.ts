/** v1.7 剧情事件：内置剧本与触发器元数据（shared barrel） */
export type { EventSettingsFields } from './event-settings';
export {
  BUILT_IN_EVENTS,
  getBuiltInEvent,
} from './built-in-events';
export {
  BUILT_IN_TRIGGERS,
  BUILT_IN_EVENT_INTENTS,
  COMFORT_PHRASES,
  GOODNIGHT_PHRASES,
  eventIdForIntent,
  getTriggerSpec,
  type BuiltInEventIntent,
  type BuiltInTriggerSpec,
} from './trigger-meta';
export {
  BUILT_IN_CONTEXT_TRIGGERS,
  CONTEXT_SCENE_IDS,
  CONTEXT_TRIGGER_KINDS,
  LATE_NIGHT_END_HOUR,
  LATE_NIGHT_START_HOUR,
  LONG_NO_CHAT_TRIGGER_MS,
  TIME_OF_DAY_SLOTS,
  WORK_STREAK_IDLE_GAP_MS,
  WORK_STREAK_TRIGGER_MS,
  createInitialContextState,
  isLateNightHour,
  reduceContextTick,
  timeOfDaySlot,
  type ContextAwarenessState,
  type ContextTickFire,
  type ContextTickInput,
  type ContextTickResult,
  type ContextTriggerKind,
  type ContextTriggerSpec,
  type TimeOfDaySlot,
} from './context-triggers';
