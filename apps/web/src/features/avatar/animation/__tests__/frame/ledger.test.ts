import { describe, expect, it } from 'vitest';
import type { BehaviorRunner } from '../../behavior';
import type { BoneMask } from '../../contracts';
import type { RegionClaim } from '../../frame/ledger';
import { FrameLedger, regionsForMask } from '../../frame/ledger';
import { collectBehaviorClaims } from '../../frame/behavior-claims';

const ARMS: BoneMask = { include: ['leftArm', 'rightArm'] };

function claim(owner: string, region: RegionClaim['region'], priority: number, weight = 1): RegionClaim {
  return { region, owner, layer: 'motion', mode: 'override', priority, weight };
}

describe('FrameLedger（帧区域台账）', () => {
  it('mask 正确映射到左右手臂区域', () => {
    expect(regionsForMask(ARMS)).toEqual(['leftArm', 'rightArm']);
  });

  it('高优先级接管；叠加层不参与 winner', () => {
    const ledger = new FrameLedger(false);
    ledger.begin();
    ledger.claim(claim('base:clip', 'leftArm', 0));
    ledger.claim(claim('behavior:hug', 'leftArm', 10));
    ledger.claim({ ...claim('overlay:gaze', 'leftArm', 30), mode: 'additive' });
    const snap = ledger.finish(0);
    const arm = snap.regions.find((entry) => entry.region === 'leftArm')!;
    expect(arm.winner?.owner).toBe('behavior:hug');
    expect(arm.conflicts).toEqual([]);
    expect(arm.claims).toHaveLength(3);
  });

  it('同优先级不同写者记为冲突', () => {
    const ledger = new FrameLedger(false);
    ledger.begin();
    ledger.claim(claim('idle:relax', 'leftArm', 10));
    ledger.claim(claim('behavior:hug', 'leftArm', 10));
    const snap = ledger.finish(0);
    const arm = snap.regions.find((entry) => entry.region === 'leftArm')!;
    expect(arm.conflicts).toEqual(['idle:relax', 'behavior:hug']);
    expect(snap.conflictCount).toBe(1);
  });

  it('同一行为的多个轨道不算冲突', () => {
    const ledger = new FrameLedger(false);
    ledger.begin();
    ledger.claim(claim('behavior:hug', 'leftArm', 10, 0.4));
    ledger.claim(claim('behavior:hug', 'leftArm', 10, 0.6));
    const snap = ledger.finish(0);
    expect(snap.regions.find((entry) => entry.region === 'leftArm')!.conflicts).toEqual([]);
  });

  it('权重为 0 的 claim 不入账', () => {
    const ledger = new FrameLedger(false);
    ledger.begin();
    ledger.claim(claim('idle:relax', 'leftArm', 10, 0));
    const snap = ledger.finish(0);
    expect(snap.regions.find((entry) => entry.region === 'leftArm')!.claims).toEqual([]);
  });

  it('每帧 begin 清空上一帧写者', () => {
    const ledger = new FrameLedger(false);
    ledger.begin();
    ledger.claim(claim('behavior:hug', 'leftArm', 10));
    ledger.finish(0);
    ledger.begin();
    const snap = ledger.finish(1);
    expect(snap.frame).toBe(2);
    expect(snap.regions.find((entry) => entry.region === 'leftArm')!.winner).toBeNull();
  });
});

describe('collectBehaviorClaims（行为轨道投影）', () => {
  it('只投影 pose/motion 轨，权重乘行为权重', () => {
    const runner = {
      behaviorId: 'behavior.hug',
      weight: 0.5,
      tracks: [
        { kind: 'pose', pose: 'pose.hug', mask: ARMS, weight: 0.8 },
        { kind: 'motion', motion: 'motion.hug', mask: ARMS },
        { kind: 'look', target: 'camera' },
        { kind: 'morph', channels: {} },
      ],
    } as unknown as BehaviorRunner;
    const claims = collectBehaviorClaims(runner);
    expect(claims).toHaveLength(2);
    expect(claims[0]).toMatchObject({ ref: 'pose.hug', mask: ARMS, weight: 0.4 });
    expect(claims[1]).toMatchObject({ ref: 'motion.hug', mask: ARMS, weight: 0.5 });
  });

  it('无行为时返回空数组', () => {
    const runner = { behaviorId: null, weight: 0, tracks: [] } as unknown as BehaviorRunner;
    expect(collectBehaviorClaims(runner)).toEqual([]);
  });
});
