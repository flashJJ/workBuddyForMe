/** @域入口 interaction：v2.16 公开入口（交互桥 / 触发总线 / 动作执行器） */
export { bridgeEventFire, mapContextTrigger, mapSceneToEvent } from './event-bridge';
export { TriggerBus } from './trigger-bus';
export { ActionExecutor } from './action-executor';
export type { ControllerLike, ExecutorDeps, SubtitleFn } from './action-executor';
