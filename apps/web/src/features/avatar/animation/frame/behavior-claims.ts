import type { BehaviorRunner } from '../behavior';
import type { BoneMask } from '../contracts';

/**
 * 行为轨道 → 区域 claim 的只读投影。
 * 不改执行顺序，只为帧台账提供「本帧行为写了哪些区域」。
 */
export interface BehaviorClaim {
  /** pose / motion id */
  ref: string;
  mask: BoneMask;
  weight: number;
}

export function collectBehaviorClaims(runner: BehaviorRunner): BehaviorClaim[] {
  const behaviorWeight = runner.weight;
  if (behaviorWeight <= 0 || runner.behaviorId === null) return [];
  const claims: BehaviorClaim[] = [];
  for (const track of runner.tracks) {
    if (track.kind === 'pose') {
      claims.push({ ref: track.pose, mask: track.mask, weight: behaviorWeight * (track.weight ?? 1) });
    } else if (track.kind === 'motion') {
      claims.push({ ref: track.motion, mask: track.mask, weight: behaviorWeight * (track.weight ?? 1) });
    }
  }
  return claims;
}
