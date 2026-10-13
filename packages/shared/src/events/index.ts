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
