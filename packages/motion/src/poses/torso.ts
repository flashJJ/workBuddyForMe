import type { BoneMask, PoseDefinition } from '../contracts';

const TORSO: BoneMask = { include: ['spine'] };

/** 后颈受力：脊柱/颈部轻微前弓 */
export const SCRUFF_ARCH: PoseDefinition = {
  id: 'pose.scruff-arch',
  mask: TORSO,
  bones: {
    spine: { x: 0.12 },
    neck: { x: 0.08 },
  },
};

/** 落地缓冲：脊柱略后压，配合 squash 包络回到基准 */
export const LAND_SETTLE: PoseDefinition = {
  id: 'pose.land-settle',
  mask: TORSO,
  bones: {
    spine: { x: -0.06 },
    neck: { x: -0.03 },
  },
};
