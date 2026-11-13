/**
 * M0d T2.4：L3 行为视线轨道。
 *
 * 只做「视线目标 → 归一化方向」映射，不依赖 three；
 * `pointer` 的具体坐标由调用方用实时指针覆盖。
 */

import type { ScriptLookTarget } from '@wbfm/shared/schemas';

/** 与剧本 cue 的 look 目标同口径：x 右正、y 下正 */
export const LOOK_DIRECTIONS: Readonly<Record<ScriptLookTarget, readonly [number, number]>> = {
  camera: [0, 0],
  pointer: [0, 0],
  away: [0.7, 0],
  up: [0, -1],
  down: [0, 1],
};
