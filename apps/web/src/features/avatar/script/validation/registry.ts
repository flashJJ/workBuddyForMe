/**
 * P8.1：剧本原语注册表（生成器与运行时校验共用）。
 *
 * 只导出 id 目录，不持有状态：
 * - 生成器侧：作为 LLM 的受限 schema 白名单（AI 只能引用这里列出的 id）；
 * - 运行时侧：`validation/validate.ts` 用同一套集合清洗 cue，避免两处漂移。
 *
 * 新增 pose/motion/behavior/prop 时，只要进各自注册表，这里自动生效。
 */
import {
  EXPRESSION_TAGS,
  PET_LINE_POOLS,
  SCRIPT_GESTURES,
  SCRIPT_LOOK_TARGETS,
} from '@wbfm/shared/schemas';
import { BEHAVIORS, MOTIONS, POSES } from '../../animation';
import { PROPS } from '../../vrm/props/prop-manifest';
import { BUILTIN_POSE_PRESETS } from '../adapters/vrm-adapter';

export interface ScriptPropPrimitive {
  id: string;
  kind: 'hand' | 'stage';
}

/** 生成器可直接序列化的白名单目录 */
export interface ScriptPrimitiveCatalog {
  /** L1 姿势注册表 id（pose.*） */
  poses: readonly string[];
  /** pose cue 可用的预设 id（squash / stand / sit-sill…） */
  posePresets: readonly string[];
  /** 内部 L2 动作 id（motion.*）；VRMA 走 `motion:<fileRef>`，不在此列 */
  motions: readonly string[];
  /** L3 行为 id（behavior.*） */
  behaviors: readonly string[];
  expressions: readonly string[];
  gestures: readonly string[];
  lookTargets: readonly string[];
  linePools: readonly string[];
  props: readonly ScriptPropPrimitive[];
}

export const SCRIPT_PRIMITIVES: ScriptPrimitiveCatalog = {
  poses: POSES.map((pose) => pose.id),
  posePresets: Object.keys(BUILTIN_POSE_PRESETS),
  motions: MOTIONS.map((motion) => motion.id),
  behaviors: BEHAVIORS.map((behavior) => behavior.id),
  expressions: [...EXPRESSION_TAGS],
  gestures: [...SCRIPT_GESTURES],
  lookTargets: [...SCRIPT_LOOK_TARGETS],
  linePools: Object.keys(PET_LINE_POOLS),
  props: Object.entries(PROPS).map(([id, spec]) => ({ id, kind: spec.kind })),
};

/** 运行时校验用的集合视图；presets 可追加调用方的自定义预设 */
export interface ScriptPrimitiveSets {
  poses: ReadonlySet<string>;
  presets: ReadonlySet<string>;
  motions: ReadonlySet<string>;
  behaviors: ReadonlySet<string>;
  expressions: ReadonlySet<string>;
  gestures: ReadonlySet<string>;
  lookTargets: ReadonlySet<string>;
  pools: ReadonlySet<string>;
  props: ReadonlyMap<string, 'hand' | 'stage'>;
}

export function createScriptPrimitiveSets(
  extraPresets: readonly string[] = [],
): ScriptPrimitiveSets {
  return {
    poses: new Set(SCRIPT_PRIMITIVES.poses),
    presets: new Set([...SCRIPT_PRIMITIVES.posePresets, ...extraPresets]),
    motions: new Set(SCRIPT_PRIMITIVES.motions),
    behaviors: new Set(SCRIPT_PRIMITIVES.behaviors),
    expressions: new Set(SCRIPT_PRIMITIVES.expressions),
    gestures: new Set(SCRIPT_PRIMITIVES.gestures),
    lookTargets: new Set(SCRIPT_PRIMITIVES.lookTargets),
    pools: new Set(SCRIPT_PRIMITIVES.linePools),
    props: new Map(SCRIPT_PRIMITIVES.props.map((prop) => [prop.id, prop.kind])),
  };
}
