/** @域 barrel avatar：v2.16 公开入口（纯 re-export，按需导出轻量能力） */
export { AvatarCanvasRouter } from './ui/avatar-canvas-router';
export { useHeadTouch, type TouchControllerLike } from './ui/use-head-touch';
export { AVATAR_MODEL_LIST, getAvatarModel } from './ui/avatar-models';
export {
  DEFAULT_EXPRESSION,
  latestExpression,
  type ExpressionTag,
} from './expression/expression-parser';
export { useEmotionState } from './expression/use-emotion-expression';
export { pulseReunionSignal } from './reunion/reunion-storage';
export { ReunionSignalHost } from './reunion/use-reunion-foreground-signal';
export { useReunionGreeting } from './reunion/use-reunion-greeting';
export type { Live2dController } from './live2d/live2d-controller';
export { Live2dMicrodynamics } from './live2d/live2d-microdynamics';
export { loadCubismCore } from './live2d/live2d-core';
export type { VrmControllerLike } from './vrm/vrm-controller';
