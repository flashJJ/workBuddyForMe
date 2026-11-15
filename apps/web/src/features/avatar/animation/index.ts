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

export { DEFAULT_MOTION_CONTENT, type MotionContent } from './content';
export { useMotionContent } from './content/use-motion-content';

export {
  MorphExecutor,
  type MorphDebugSnapshot,
  type MorphMeshHandle,
} from './morph';

export { LOOK_DIRECTIONS } from './look';

export {
  JOINT_LIMITS,
  validatePose,
  validatePoses,
  type Axis,
  type AxisLimit,
  type BoneLimits,
  type PoseLimitIssue,
} from './constraints';

export {
  direction,
  solveTwoBone,
  type TwoBoneSolution,
  type Vec3,
} from './ik';

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

export {
  EAT_BITE_MOTION,
  GLANCE,
  LOOK_AROUND,
  MOTIONS,
  NOD,
  NOD_DOUBLE,
  SHAKE,
  SHY_MOTION,
  STOMP,
  STRETCH_UP,
  TILT,
  WAVE,
} from './motions';

export {
  ARMS_HANG,
  ARMS_LIMP,
  EAT_BITE,
  EAT_HOLD,
  HEAD_DOWN,
  HEAD_GLANCE_LEFT,
  HEAD_GLANCE_RIGHT,
  HEAD_LIFT,
  HEAD_LOOK_UP_LEFT,
  HEAD_LOOK_UP_RIGHT,
  HEAD_NEUTRAL,
  HEAD_SHAKE_LEFT,
  HEAD_SHAKE_RIGHT,
  HEAD_TILT_LEFT,
  HEAD_TILT_RIGHT,
  HEAD_UP,
  IDLE_BODY,
  LAND_SETTLE,
  LEGS_DANGLE,
  LEGS_STAND,
  POSES,
  SCOLD_HUFF,
  SCRUFF_ARCH,
  SHY,
  STOMP_DOWN,
  STOMP_LIFT,
  WAVE_IN,
  WAVE_OUT,
  WAVE_RAISED,
} from './poses';

export {
  BEHAVIORS,
  EAT_RICE,
  FACE_AWAY,
  HEAD_PAT,
  IDLE,
  LAND,
  LIFTED,
  SCOLD_FAT,
  SLEEP,
  WAKE,
  WORK_FOCUS,
} from './behaviors';

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
