import { describe, expect, it } from 'vitest';
import type { BoneMask } from '../../../animation/contracts';
import type { VrmAnimationRuntime } from '../../../animation/adapters/vrm';
import { VrmScriptMotionOverlay } from './vrm-script-motion';

interface Applied {
  id: string;
  elapsedMs: number;
  weight: number;
  mask: BoneMask;
}

const DURATION_MS = 1000;

function fakeRuntime(ids: string[] = ['motion.wave']): {
  runtime: VrmAnimationRuntime;
  applied: Applied[];
} {
  const applied: Applied[] = [];
  const runtime = {
    motions: {
      get: (id: string) =>
        ids.includes(id) ? { id, durationMs: DURATION_MS, keys: [] } : undefined,
    },
    applyMotion: (id: string, elapsedMs: number, weight: number, _offset: number, mask: BoneMask) => {
      applied.push({ id, elapsedMs, weight, mask });
      return 1;
    },
  } as unknown as VrmAnimationRuntime;
  return { runtime, applied };
}

describe('VrmScriptMotionOverlay 剧本动作层', () => {
  it('未登记动作返回 false，登记动作可播放并占用独立槽位', () => {
    const { runtime, applied } = fakeRuntime();
    const overlay = new VrmScriptMotionOverlay(runtime);
    expect(overlay.play('motion.none')).toBe(false);
    expect(overlay.play('motion.wave')).toBe(true);
    expect(overlay.active).toBe(true);
    expect(overlay.motionId).toBe('motion.wave');
    overlay.update(100);
    expect(applied).toHaveLength(1);
  });

  it('全身 mask + 按 fadeMs 淡入', () => {
    const { runtime, applied } = fakeRuntime();
    const overlay = new VrmScriptMotionOverlay(runtime);
    overlay.play('motion.wave', { fadeMs: 200 });
    overlay.update(100);
    expect(applied[0]?.weight).toBeCloseTo(0.5, 6);
    expect(applied[0]?.mask.include).toEqual([
      'spine',
      'head',
      'leftArm',
      'rightArm',
      'leftLeg',
      'rightLeg',
    ]);
    overlay.update(100);
    expect(applied[1]?.weight).toBe(1);
  });

  it('非循环动作到时长后淡出并自动释放', () => {
    const { runtime, applied } = fakeRuntime();
    const overlay = new VrmScriptMotionOverlay(runtime);
    overlay.play('motion.wave', { fadeMs: 200 });
    overlay.update(DURATION_MS);
    expect(overlay.active).toBe(true);
    expect(applied[0]?.weight).toBe(1);
    overlay.update(100);
    expect(applied[1]?.weight).toBeCloseTo(0.5, 6);
    overlay.update(100);
    expect(overlay.active).toBe(false);
    const count = applied.length;
    overlay.update(100);
    expect(applied).toHaveLength(count);
  });

  it('循环动作不自动释放；stop 只停当前匹配的动作', () => {
    const { runtime } = fakeRuntime();
    const overlay = new VrmScriptMotionOverlay(runtime);
    overlay.play('motion.wave', { loop: true });
    overlay.update(DURATION_MS * 3);
    expect(overlay.active).toBe(true);
    expect(overlay.stop('motion.other')).toBe(false);
    expect(overlay.active).toBe(true);
    expect(overlay.stop('motion.wave')).toBe(true);
    expect(overlay.active).toBe(false);
  });
});
