/** @域 barrel avatar：v2.16 公开入口（纯 re-export，按需导出轻量能力） */
export { AvatarCanvasRouter } from './ui/avatar-canvas-router';
export { useHeadTouch, type TouchControllerLike } from './ui/use-head-touch';
export { useAvatarChibi } from './ui/use-avatar-chibi';
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
export {
  FRAME_INTERVAL_BY_MODE,
  frameRateForMode,
  shouldRenderFrame,
  type FrameMode,
} from './performance/frame-governor';
export type { AvatarScreenRect } from './performance/screen-rect';
export type { Live2dController } from './live2d/live2d-controller';
export { Live2dMicrodynamics } from './live2d/live2d-microdynamics';
export { loadCubismCore } from './live2d/live2d-core';
export type { VrmControllerLike } from './vrm/vrm-controller';
export {
  PET_SCRIPT_ENABLED,
  useScriptDirector,
  type ScriptControllerHandle,
  type ScriptCueContext,
  type ScriptDirectorHandle,
} from './script/use-script-director';
export { useGeneratedScripts, type GeneratedScriptsState } from './script/generation/client';
export { useSceneContent } from './script/content/use-scene-content';
export { usePropContent } from './vrm/props/use-prop-content';
export type { PropRegistry } from './vrm/props/prop-manifest';
export type { TriggerDecisionExtras } from './script/utility';
export {
  usePetProactivePlayback,
  useProactivePlayback,
  type ProactivePlaybackHandle,
  type UsePetProactivePlaybackOptions,
  type UseProactivePlaybackOptions,
} from './script/generation/client';
export { MotionPreviewOverlay } from './animation/devtools/preview-panel';
export { MotionContentMenu, type MotionContentSelection, type MotionContentKind } from './animation/content/motion-content-menu';
export { ScriptDebugPanel } from './script/devtools/script-debug-panel';
export {
  SCRIPT_PRIMITIVES,
  createScriptPrimitiveSets,
  type ScriptPrimitiveCatalog,
} from './script/validation/registry';
