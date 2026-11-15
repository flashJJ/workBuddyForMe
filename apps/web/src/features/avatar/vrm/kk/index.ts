/**
 * KK 面部表情子域：目录（语义/强度归类）、组合预设、运行时 morph 驱动。
 * 目录只描述数据；预设是「应用表情 → morph 权重」的唯一来源；驱动负责写入。
 */
export { KkFaceDriver } from './kk-face-driver';
export {
  KK_MORPHS,
  KK_MORPH_BY_NAME,
  findKkMorphs,
  pickKkMorph,
} from './kk-expression-catalog';
export type {
  KkEyeState,
  KkExpressionGroup,
  KkIntensity,
  KkMorphInfo,
  KkMorphPart,
} from './kk-expression-catalog';
export {
  KK_EXPRESSION_PRESETS,
  KK_INTENSITY_LABELS,
  collectPresetMorphNames,
  resolveKkExpression,
  stripMouthMorphs,
} from './kk-expression-presets';
export type { KkExpressionCombo, KkMorphWeight } from './kk-expression-presets';
