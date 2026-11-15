import { describe, expect, it, vi } from 'vitest';
import type { VrmAnimationRuntime } from '../../../animation/adapters/vrm';
import { VrmPreviewPose } from './vrm-preview-pose';

function fakeRuntime() {
  return {
    poses: { has: (id: string) => id === 'pack.pose.wave' },
    applyPose: vi.fn(),
  } as unknown as VrmAnimationRuntime;
}

describe('VrmPreviewPose（v4.0）', () => {
  it('存在的姿势可播放并叠加到骨骼', () => {
    const runtime = fakeRuntime();
    const preview = new VrmPreviewPose(() => runtime);
    expect(preview.play('pack.pose.wave', 1000)).toBe(true);
    preview.apply(performance.now());
    expect(runtime.applyPose).toHaveBeenCalledWith('pack.pose.wave', 1, 0, false);
  });

  it('未知姿势拒绝，过期后不再写入', () => {
    const runtime = fakeRuntime();
    const preview = new VrmPreviewPose(() => runtime);
    expect(preview.play('pack.pose.missing')).toBe(false);

    expect(preview.play('pack.pose.wave', 200)).toBe(true);
    preview.apply(performance.now() + 10_000);
    expect(runtime.applyPose).not.toHaveBeenCalled();
  });
});
