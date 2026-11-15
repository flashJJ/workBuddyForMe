/**
 * KK（恋活）面部 morph 目录：把 118 个导出 morph 归纳成「部位 × 语义组 × 程度 × 眼睑状态」。
 *
 * 用途：
 * - 表情组合（kk-expression-presets）按语义组挑选，不直接写死索引；
 * - 后续新增表情时先在这里查有没有现成的轻微/中等/强烈档，避免重复造数据；
 * - 目录只描述已有数据，不驱动渲染，渲染见 kk-face-driver。
 *
 * 数据源用 animeart-v1 binding 的 targets（名称 + 索引），保证目录与运行时绑定同源。
 */
import animeartBinding from '../../animation/bindings/animeart-v1.json';

export type KkMorphPart = 'eye' | 'brow' | 'mouth' | 'gaze' | 'other';

/** 语义组：7 个基础情绪 + 状态/动作/口型等可复用组 */
export type KkExpressionGroup =
  | 'joy'
  | 'sadness'
  | 'anger'
  | 'fear'
  | 'surprise'
  | 'disgust'
  | 'smirk'
  | 'shy'
  | 'pain'
  | 'bored'
  | 'thinking'
  | 'serious'
  | 'action'
  | 'viseme'
  | 'state'
  | 'gaze'
  | 'neutral';

/** 程度档：1 轻微 / 2 中等 / 3 强烈（由 small/slight/moderate/big/broad/sharp 等词推断） */
export type KkIntensity = 1 | 2 | 3;

/** 眼睑版本：KK 把同一表情导出成睁眼（_op）与闭眼（_cl）两份 */
export type KkEyeState = 'open' | 'closed' | 'none';

export interface KkMorphInfo {
  index: number;
  name: string;
  part: KkMorphPart;
  group: KkExpressionGroup;
  intensity: KkIntensity;
  eyeState: KkEyeState;
  /** 已被 VRM 0.x 标准表情组绑定（保留兼容，改动前先确认没有回归） */
  vrmBound: boolean;
}

const GROUP_RULES: ReadonlyArray<readonly [RegExp, KkExpressionGroup]> = [
  [/^Eye_look_/, 'gaze'],
  [/default|wink|blink/i, 'state'],
  [/squeeze/i, 'state'],
  [/shocked|amazed|gageye/i, 'surprise'],
  [/smug/i, 'smirk'],
  [/crying|lonely|dejected|worried|distress|sad/i, 'sadness'],
  [/displeased|hate/i, 'disgust'],
  [/angry|impatient/i, 'anger'],
  [/pain/i, 'pain'],
  [/shy/i, 'shy'],
  [/bored/i, 'bored'],
  [/thinking|doubt/i, 'thinking'],
  [/serious/i, 'serious'],
  [/happy|smile|grin|joy/i, 'joy'],
  [/neko|tongue|lick|kiss|hold_in_mouth|triangle|cartoon|chewing|eating|doki/i, 'action'],
  [/^Mouth_[aiueo]_/, 'viseme'],
  [/^Mouth_n_/, 'viseme'],
];

function partOf(name: string): KkMorphPart {
  if (name.startsWith('Eye_look_')) return 'gaze';
  if (name.startsWith('Eyebrows_')) return 'brow';
  if (name.startsWith('Eyes_')) return 'eye';
  if (name.startsWith('Mouth_')) return 'mouth';
  return 'other';
}

function groupOf(name: string, part: KkMorphPart): KkExpressionGroup {
  if (part === 'other') return 'neutral';
  for (const [pattern, group] of GROUP_RULES) if (pattern.test(name)) return group;
  return 'neutral';
}

function intensityOf(name: string): KkIntensity {
  if (/slight|small/i.test(name)) return 1;
  if (/moderate/i.test(name)) return 2;
  if (/big|broad|sharp/i.test(name)) return 3;
  return 2;
}

function eyeStateOf(name: string): KkEyeState {
  if (/_cl(\s|$)/i.test(name)) return 'closed';
  if (/_op(\s|$)/i.test(name)) return 'open';
  return 'none';
}

const boundNames = new Set(
  Object.values(animeartBinding.standardExpressions as Record<string, { name: string }[]>)
    .flat()
    .map((target) => target.name),
);

export const KK_MORPHS: readonly KkMorphInfo[] = animeartBinding.targets.map((target) => ({
  index: target.index,
  name: target.name,
  part: partOf(target.name),
  group: groupOf(target.name, partOf(target.name)),
  intensity: intensityOf(target.name),
  eyeState: eyeStateOf(target.name),
  vrmBound: boundNames.has(target.name),
}));

export const KK_MORPH_BY_NAME: ReadonlyMap<string, KkMorphInfo> = new Map(
  KK_MORPHS.map((morph) => [morph.name, morph]),
);

export function findKkMorphs(group: KkExpressionGroup, part?: KkMorphPart): readonly KkMorphInfo[] {
  return KK_MORPHS.filter((morph) => morph.group === group && (!part || morph.part === part));
}

/** 按部位 + 程度取一个候选（同名多档时优先程度更高的，供后续扩展手动挑选） */
export function pickKkMorph(
  part: KkMorphPart,
  group: KkExpressionGroup,
  intensity: KkIntensity = 2,
): KkMorphInfo | null {
  const candidates = KK_MORPHS.filter(
    (morph) => morph.part === part && morph.group === group && morph.intensity === intensity,
  );
  return candidates[0] ?? null;
}
