import { describe, expect, it } from 'vitest';
import { PoseVariantResolver } from '../../variants';
import { isBoneInMask } from '../../mask';
import { POSES } from '../../poses';
import type { PoseDefinition } from '../../contracts';

const POSE: PoseDefinition = {
  id: 'pose.test-cluster',
  mask: { include: ['spine'] },
  bones: { spine: { x: 0.05 } },
  variants: [
    { bones: { spine: { x: 0.1 } } },
    { bones: { spine: { x: 0.2 } } },
    { bones: { spine: { x: 0.3 } } },
  ],
};

function resolver(random: number[]) {
  let i = 0;
  return new PoseVariantResolver({
    holdMs: 1000,
    blendMs: 200,
    random: () => random[Math.min(i++, random.length - 1)] ?? 0,
  });
}

describe('PoseVariantResolver（姿态变体簇）', () => {
  it('没有变体时原样返回', () => {
    const plain: PoseDefinition = { id: 'pose.plain', mask: { include: ['spine'] }, bones: { spine: { x: 0.1 } } };
    const r = resolver([0]);
    expect(r.resolve(plain, 0)).toBe(plain);
    expect(r.resolve(undefined, 0)).toBeUndefined();
  });

  it('单个变体直接替换骨骼', () => {
    const single: PoseDefinition = {
      id: 'pose.single',
      mask: { include: ['spine'] },
      bones: { spine: { x: 0.05 } },
      variants: [{ bones: { spine: { x: 0.12 } } }],
    };
    expect(resolver([0]).resolve(single, 0)?.bones.spine?.x).toBeCloseTo(0.12, 5);
  });

  it('按 hold 切换变体并交叉淡入', () => {
    // 首次 random 0.99 → 变体 2；到 1000ms 后 random 0 → 变体 0
    const r = resolver([0.99, 0]);
    expect(r.resolve(POSE, 0)?.bones.spine?.x).toBeCloseTo(0.3, 5);
    // 切换瞬间仍接近旧变体
    expect(r.resolve(POSE, 1000)?.bones.spine?.x).toBeCloseTo(0.3, 5);
    // 淡入中点
    expect(r.resolve(POSE, 1100)?.bones.spine?.x).toBeCloseTo(0.2, 5);
    // 淡入结束
    expect(r.resolve(POSE, 1300)?.bones.spine?.x).toBeCloseTo(0.1, 5);
  });

  it('避免连续使用同一个变体', () => {
    const r = resolver([0, 0]);
    expect(r.resolve(POSE, 0)?.bones.spine?.x).toBeCloseTo(0.1, 5); // 变体 0
    expect(r.resolve(POSE, 1900)?.bones.spine?.x).toBeCloseTo(0.2, 5); // 避开 0 → 变体 1
  });
});

/** 正式接入变体簇的站姿 / 坐姿（改内容时同步维护） */
const CLUSTERED_POSES = [
  'pose.stance-weight-left',
  'pose.stance-weight-right',
  'pose.sit-ready',
  'pose.sit-sill',
  'pose.sit-desk',
] as const;

describe('内置站姿 / 坐姿变体簇', () => {
  const byId = new Map(POSES.map((pose) => [pose.id, pose]));

  it('每类都配了至少 3 个变体', () => {
    for (const id of CLUSTERED_POSES) {
      expect(byId.get(id)?.variants?.length ?? 0, id).toBeGreaterThanOrEqual(3);
    }
  });

  it('变体骨骼键与基准一致，切换时不会丢骨骼', () => {
    for (const id of CLUSTERED_POSES) {
      const pose = byId.get(id);
      const expected = Object.keys(pose?.bones ?? {}).sort();
      for (const variant of pose?.variants ?? []) {
        expect(Object.keys(variant.bones).sort(), id).toEqual(expected);
      }
    }
  });

  it('变体差异 ≤0.12 rad 且骨骼都在 mask 内', () => {
    for (const id of CLUSTERED_POSES) {
      const pose = byId.get(id);
      if (!pose) continue;
      for (const variant of pose.variants ?? []) {
        for (const [bone, rotation] of Object.entries(variant.bones)) {
          if (!rotation) continue;
          expect(isBoneInMask(pose.mask, bone), `${id}:${bone}`).toBe(true);
          const base = pose.bones[bone];
          for (const axis of ['x', 'y', 'z'] as const) {
            const delta = Math.abs((rotation[axis] ?? 0) - (base?.[axis] ?? 0));
            expect(delta, `${id}:${bone}.${axis}`).toBeLessThanOrEqual(0.12);
          }
        }
      }
    }
  });
});
