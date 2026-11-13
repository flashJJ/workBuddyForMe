import { describe, expect, it } from 'vitest';
import { FramePlan, resolveClaims } from '../../frame/plan';
import type { BodyRegion, ClaimMode, RegionClaim } from '../../frame/regions';

function claim(
  owner: string,
  region: BodyRegion,
  priority: number,
  mode: ClaimMode = 'override',
  weight = 1,
): RegionClaim {
  return { owner, region, priority, mode, weight, layer: 'motion' };
}

describe('FramePlan（写入前决议）', () => {
  it('高优先级接管，低优先级基础层仍允许写入', () => {
    const result = resolveClaims([claim('base:clip', 'leftArm', 0), claim('behavior:hug', 'leftArm', 10)]);
    const plan = new FramePlan(result);
    expect(result.regions.find((entry) => entry.region === 'leftArm')!.winner?.owner).toBe('behavior:hug');
    expect(result.conflictCount).toBe(0);
    expect(plan.allows('behavior:hug')).toBe(true);
    expect(plan.allows('base:clip')).toBe(true);
  });

  it('同优先级不同 owner：winner 保留，loser 被拒绝', () => {
    const result = resolveClaims([claim('idle:relax', 'leftArm', 10), claim('behavior:hug', 'leftArm', 10)]);
    const entry = result.regions.find((item) => item.region === 'leftArm')!;
    const plan = new FramePlan(result);
    expect(entry.winner?.owner).toBe('idle:relax');
    expect(entry.losers).toEqual(['behavior:hug']);
    expect(entry.conflicts).toEqual(['idle:relax', 'behavior:hug']);
    expect(plan.allows('idle:relax')).toBe(true);
    expect(plan.allows('behavior:hug')).toBe(false);
    expect(plan.allowsRegion('behavior:hug', 'leftArm')).toBe(false);
    expect(plan.allowsRegion('behavior:hug', 'rightArm')).toBe(true);
  });

  it('同一 owner 多轨不视为冲突', () => {
    const result = resolveClaims([
      claim('behavior:hug', 'leftArm', 10, 'override', 0.4),
      claim('behavior:hug', 'leftArm', 10, 'override', 0.6),
    ]);
    const plan = new FramePlan(result);
    expect(result.conflictCount).toBe(0);
    expect(plan.allows('behavior:hug')).toBe(true);
  });

  it('additive 层不参与 winner，也不会被拒绝', () => {
    const result = resolveClaims([
      claim('behavior:hug', 'head', 10),
      claim('overlay:gaze', 'head', 30, 'additive'),
    ]);
    const entry = result.regions.find((item) => item.region === 'head')!;
    const plan = new FramePlan(result);
    expect(entry.winner?.owner).toBe('behavior:hug');
    expect(plan.allows('overlay:gaze')).toBe(true);
  });

  it('某个区域落败会整体拒绝该 owner，避免只写一半身体', () => {
    const result = resolveClaims([
      claim('idle:relax', 'leftArm', 10),
      claim('behavior:hug', 'leftArm', 10),
      claim('behavior:hug', 'rightArm', 10),
    ]);
    const plan = new FramePlan(result);
    expect(plan.allowsRegion('behavior:hug', 'rightArm')).toBe(true);
    expect(plan.allows('behavior:hug')).toBe(false);
  });
});
