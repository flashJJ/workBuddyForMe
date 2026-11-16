/**
 * 剧本白名单与时间约束校验（P8.1）：把非法 cue 从场景里剔除并记录原因。
 *
 * 校验对象是 `validation/registry.ts` 导出的同一套原语目录：
 * - pose → pose 预设 / 姿势注册表
 * - gesture / look / expression → shared schema 枚举
 * - motion.* → 内部 MOTIONS；motion:* → VRMA fileRef（非空且长度合法）
 * - behavior.* → BEHAVIORS
 * - line/speak pool → PET_LINE_POOLS
 * - prop → prop-manifest，并校验动作与 hand/stage 类型匹配
 *
 * 时间约束：beat.at 必须落在 0..BEAT_MAX_MS；乱序 beat 会先稳定排序再校验；
 * cue 自带时长（wait/holdMs/ms）与权重（intensity/weight）超出范围即丢弃。
 * branch 递归清洗；清洗后为空的 branch 整条丢弃。
 */
import { BEAT_MAX_MS, type Cue, type Scene } from '@wbfm/shared/schemas';
import type { MotionContent } from '../../animation';
import type { PropRegistry } from '../../vrm/props/prop-manifest';
import { createScriptPrimitiveSets, type ScriptPrimitiveSets } from './registry';

const DEFAULT_PRIMITIVES = createScriptPrimitiveSets();
/** 与 shared cue schema 的 zod 上限保持一致 */
const MAX_HOLD_MS = 60_000;
const MAX_WAIT_MS = 600_000;
const MAX_TEXT_LENGTH = 200;
const MAX_ID_LENGTH = 160;

export interface ValidateSceneOptions {
  /** 额外允许的 pose 预设（与适配器的 presets 保持一致） */
  presets?: readonly string[];
  /** v4.0：按会话内容快照校验；缺省使用内置内容 */
  content?: MotionContent;
  /** v4.3 M3：内置 + 包内道具注册表；缺省使用内置道具 */
  props?: PropRegistry;
}

export interface SceneValidationResult {
  scene: Scene;
  /** `${sceneId}#beatIndex[.then]` → 原因 */
  dropped: string[];
}

function primitivesFor(options?: ValidateSceneOptions): ScriptPrimitiveSets {
  if (!options?.content && !options?.presets?.length && !options?.props) return DEFAULT_PRIMITIVES;
  return createScriptPrimitiveSets(options?.presets ?? [], options?.content, options?.props);
}

/** 可选数值的 0..max 校验；undefined 表示未设置，直接通过 */
function rangeIssue(value: number | undefined, max: number, label: string): string | null {
  if (value === undefined) return null;
  if (!Number.isFinite(value) || value < 0 || value > max) return `${label} 超出 0..${max}`;
  return null;
}

function textIssue(value: string | undefined, label: string): string | null {
  if (value === undefined) return null;
  const text = value.trim();
  if (!text) return `${label} 为空`;
  return text.length <= MAX_TEXT_LENGTH ? null : `${label} 超过 ${MAX_TEXT_LENGTH} 字`;
}

function cueIssue(cue: Cue, primitives: ScriptPrimitiveSets): string | null {
  switch (cue.kind) {
    case 'pose':
      // 允许注册表里的 pose id，也允许预设 id（两者在场景里都可能出现）
      return primitives.presets.has(cue.preset) || primitives.poses.has(cue.preset)
        ? null
        : `未知 pose 预设 ${cue.preset}`;
    case 'gesture':
      if (!primitives.gestures.has(cue.gesture)) return `未知手势 ${cue.gesture}`;
      return rangeIssue(cue.intensity, 1, 'gesture intensity');
    case 'motion': {
      if (cue.motion.startsWith('motion:')) {
        const fileRef = cue.motion.slice('motion:'.length).trim();
        if (!fileRef) return 'VRMA motion fileRef 为空';
        return fileRef.length <= MAX_ID_LENGTH ? null : `VRMA motion fileRef 超过 ${MAX_ID_LENGTH} 字`;
      }
      return primitives.motions.has(cue.motion) ? null : `未登记 motion ${cue.motion}`;
    }
    case 'behavior':
      return primitives.behaviors.has(cue.behavior) ? null : `未登记 behavior ${cue.behavior}`;
    case 'prop': {
      const kind = primitives.props.get(cue.prop);
      if (!kind) return `未登记道具 ${cue.prop}`;
      const stageAction = cue.action === 'show' || cue.action === 'hide';
      return stageAction === (kind === 'stage')
        ? null
        : `道具动作与类型不匹配 ${cue.prop}/${cue.action}`;
    }
    case 'expression':
      if (!primitives.expressions.has(cue.tag)) return `未知表情 ${cue.tag}`;
      return rangeIssue(cue.holdMs, MAX_HOLD_MS, 'expression holdMs');
    case 'look':
      if (!primitives.lookTargets.has(cue.target)) return `未知视线目标 ${cue.target}`;
      return (
        rangeIssue(cue.weight, 1, 'look weight') ??
        rangeIssue(cue.holdMs, MAX_HOLD_MS, 'look holdMs')
      );
    case 'line':
      if (!primitives.pools.has(cue.pool)) return `未登记台词池 ${cue.pool}`;
      return rangeIssue(cue.ms, MAX_HOLD_MS, 'line ms');
    case 'speak': {
      const issue = textIssue(cue.text, 'speak text');
      if (issue) return issue;
      if (cue.text?.trim()) return null;
      return cue.pool && primitives.pools.has(cue.pool) ? null : 'speak 缺少 text 或合法 pool';
    }
    case 'wait':
      return rangeIssue(cue.ms, MAX_WAIT_MS, 'wait ms');
    case 'branch':
      return null;
    case 'sound':
    case 'effect':
    case 'move':
    case 'emit':
      // M0 保留 cue：允许存在，运行时忽略并 warn
      return null;
    default:
      return `未知 cue ${(cue as Cue).kind}`;
  }
}

function sanitizeCue(
  cue: Cue,
  path: string,
  dropped: string[],
  primitives: ScriptPrimitiveSets,
): Cue | null {
  if (cue.kind === 'branch') {
    const then = sanitizeCues(cue.then, `${path}.then`, dropped, primitives);
    const otherwise = cue.else
      ? sanitizeCues(cue.else, `${path}.else`, dropped, primitives)
      : undefined;
    if (then.length === 0 && (!otherwise || otherwise.length === 0)) {
      dropped.push(`${path}: branch 无合法 cue`);
      return null;
    }
    return otherwise ? { ...cue, then, else: otherwise } : { ...cue, then, else: undefined };
  }
  const issue = cueIssue(cue, primitives);
  if (issue) {
    dropped.push(`${path}: ${issue}`);
    return null;
  }
  return cue;
}

function sanitizeCues(
  cues: readonly Cue[],
  path: string,
  dropped: string[],
  primitives: ScriptPrimitiveSets,
): Cue[] {
  const out: Cue[] = [];
  cues.forEach((cue, index) => {
    const clean = sanitizeCue(cue, `${path}[${index}]`, dropped, primitives);
    if (clean) out.push(clean);
  });
  return out;
}

/** 清洗单个场景；返回剔除后的场景与丢弃原因 */
export function validateScene(
  scene: Scene,
  options?: ValidateSceneOptions,
): SceneValidationResult {
  const primitives = primitivesFor(options);
  const dropped: string[] = [];
  const ordered = scene.beats.map((beat, index) => ({ beat, index }));
  // 稳定排序：同一 at 的 beat 保持声明顺序（生成器可能不保证有序）
  ordered.sort((a, b) => a.beat.at - b.beat.at || a.index - b.index);
  if (ordered.some((item, index) => item.index !== index)) {
    dropped.push(`${scene.id}: beats 乱序，已按 at 排序`);
  }
  const beats: Scene['beats'] = [];
  for (const { beat, index } of ordered) {
    if (!Number.isFinite(beat.at) || beat.at < 0 || beat.at > BEAT_MAX_MS) {
      dropped.push(`${scene.id}#${index}: beat at 超出 0..${BEAT_MAX_MS}`);
      continue;
    }
    const cue = sanitizeCue(beat.cue, `${scene.id}#${index}`, dropped, primitives);
    if (cue) beats.push({ ...beat, cue });
  }
  if (beats.length === 0) dropped.push(`${scene.id}: 无合法 beat`);
  return { scene: { ...scene, beats }, dropped };
}

/** 批量清洗；dropped 汇总所有场景 */
export function validateScenes(
  scenes: readonly Scene[],
  options?: ValidateSceneOptions,
): { scenes: Scene[]; dropped: string[] } {
  const dropped: string[] = [];
  const clean: Scene[] = [];
  for (const scene of scenes) {
    const result = validateScene(scene, options);
    clean.push(result.scene);
    dropped.push(...result.dropped);
  }
  return { scenes: clean, dropped };
}
