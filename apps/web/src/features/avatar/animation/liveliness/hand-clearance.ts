/**
 * 手部防穿模（T2.7）：当左右手在世界空间里靠得过近（拥抱/抱手动作常见）时，
 * 给出一个 0..1 的“张开需求”，由 VRM 适配层转成上臂的微小外旋。
 *
 * 纯数学，不依赖 three；阈值单位与模型空间一致（米）。
 */

import { clamp01 } from '../math';

export interface HandClearanceParams {
  /** 双手低于该间距开始张开（米） */
  minGap: number;
  /** 最大外旋角度（弧度，单侧） */
  maxAngle: number;
}

export const DEFAULT_HAND_CLEARANCE: HandClearanceParams = {
  // 手骨间距 < 0.18m 时开始外旋：手掌网格本身有宽度，只按骨骼距离会漏掉穿模
  minGap: 0.18,
  maxAngle: 0.3,
};

/** 0 = 不需要干预；1 = 双手完全贴上，按最大角度张开 */
export function clearanceTarget(gap: number, minGap: number): number {
  if (!(minGap > 0) || !Number.isFinite(gap)) return 0;
  if (gap >= minGap) return 0;
  return clamp01((minGap - gap) / minGap);
}
