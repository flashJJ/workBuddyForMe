import { describe, expect, it, vi } from 'vitest';

const apiGet = vi.fn();
vi.mock('@/lib/api/client', () => ({
  apiGet: (...args: unknown[]) => apiGet(...args),
  getManagedToken: () => null,
}));
vi.mock('@pixiv/three-vrm-animation', () => ({
  createVRMAnimationClip: () => ({
    name: 'clip',
    duration: 1,
    tracks: [
      { name: 'Normalized_root.position' },
      { name: 'Normalized_DEF-Left_leg.quaternion' },
      { name: 'Normalized_DEF-Left_knee.quaternion' },
      { name: 'Normalized_DEF-Left_ankle.quaternion' },
      { name: 'Normalized_DEF-Left_toe.quaternion' },
      { name: 'Normalized_DEF-Left_arm.quaternion' },
      { name: 'Normalized_DEF-Left_wrist.quaternion' },
      { name: 'Normalized_DEF-IndexFinger1_L.quaternion' },
    ],
  }),
}));

import { loadMotionPool } from '../vrm-motion-loader';

function fakeLoader(files = 1) {
  const loadAsync = vi.fn(async () => ({
    userData: { vrmAnimations: Array.from({ length: files }, () => ({})) },
  }));
  return { loader: { loadAsync } as never, loadAsync };
}

const NODE_BY_BONE: Record<string, string> = {
  leftUpperLeg: 'Normalized_DEF-Left_leg',
  leftLowerLeg: 'Normalized_DEF-Left_knee',
  leftFoot: 'Normalized_DEF-Left_ankle',
  leftToes: 'Normalized_DEF-Left_toe',
  leftHand: 'Normalized_DEF-Left_wrist',
  rightHand: 'Normalized_DEF-Right_wrist',
  leftIndexProximal: 'Normalized_DEF-IndexFinger1_L',
};

const vrm = {
  humanoid: {
    getNormalizedBoneNode: (bone: string) =>
      NODE_BY_BONE[bone] ? { name: NODE_BY_BONE[bone] } : null,
  },
};

describe('动作池装载（M4 舞台待机）', () => {
  it('builtinOnly 只加载内置 daiji，并按 humanoid 映射剔除腿脚/手指轨道', async () => {
    apiGet.mockReset();
    const { loader, loadAsync } = fakeLoader();

    const entries = await loadMotionPool(loader, vrm as never, { builtinOnly: true });

    expect(apiGet).not.toHaveBeenCalled();
    expect(loadAsync).toHaveBeenCalledTimes(1);
    expect(loadAsync).toHaveBeenCalledWith('/motions/daiji.vrma');
    expect(entries).toHaveLength(1);
    expect(entries[0]?.name).toBe('daiji');
    expect(entries[0]?.clip.name).toBe('stage-idle');
    expect(entries[0]?.clip.tracks.map((track) => track.name)).toEqual([
      'Normalized_root.position',
      'Normalized_DEF-Left_arm.quaternion',
      'Normalized_DEF-Left_wrist.quaternion',
    ]);
  });
});
