/**
 * M0c 动效分层库：公共入口（只 re-export 稳定 API）。
 *
 * 运行时装配（composer / adapters）在后续任务追加；外部只从这里引用。
 */

export type {
  BehaviorDefinition,
  BoneGroup,
  BoneMask,
  BoneQuat,
  BoneRotation,
  EasingName,
  MotionDefinition,
  MotionKey,
  PhaseDefinition,
  PoseDefinition,
  RootOffset,
  TrackDefinition,
} from './contracts';

export {
  MorphBindingError,
  buildMorphBinding,
  morphBindingSchema,
  type MorphBindingDefinition,
  type MorphBindingIndex,
  type MorphBindingTarget,
} from './binding';

export {
  clamp01,
  copyQuat,
  ease,
  lerp,
  pendulum,
  quatFromEuler,
  quatIdentity,
  quatMultiply,
  quatNlerp,
  quatNormalize,
  smoothDamp,
  springStep,
  type SpringState,
} from './math';

export {
  BONE_GROUP_MEMBERS,
  NORM_BONE_NAMES,
  groupOfBone,
  isBoneInMask,
  maskIncludes,
  resolveMask,
} from './mask';

export { Skeleton, type SkeletonBone } from './skeleton';

export { applyPose, PoseLibrary, type ApplyPoseOptions } from './pose';

export { Composer, type ComposeTrack } from './composer';

export {
  MotionLibrary,
  emptySample,
  sampleMotion,
  type MotionSample,
} from './motion';

export { GLANCE, MOTIONS, NOD, TILT } from './motions';

export {
  ARMS_HANG,
  ARMS_LIMP,
  HEAD_DOWN,
  HEAD_GLANCE_LEFT,
  HEAD_GLANCE_RIGHT,
  HEAD_LIFT,
  HEAD_NEUTRAL,
  HEAD_TILT_LEFT,
  HEAD_TILT_RIGHT,
  LAND_SETTLE,
  LEGS_DANGLE,
  LEGS_STAND,
  POSES,
  SCRUFF_ARCH,
} from './poses';

export { BEHAVIORS, FACE_AWAY, IDLE, LAND, LIFTED, SLEEP } from './behaviors';

export {
  BehaviorLibrary,
  BehaviorRunner,
  type BehaviorPhase,
  type BehaviorRunnerOptions,
  type RunnerSnapshot,
} from './behavior';

export {
  BEHAVIOR_TRANSITION_LIMIT,
  BehaviorObserver,
  getBehaviorDebug,
  setBehaviorDebugSource,
  type BehaviorDebugSnapshot,
  type BehaviorTrackDebug,
  type BehaviorTransitionDebug,
} from './observability';
