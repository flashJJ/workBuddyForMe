import { HANG, type ArmPair } from './intents';

/**
 * 待机余兴/姿势 → 手臂意图。
 *
 * 数值来自真机对现有欧拉姿势的世界方向采样（2026-11-13）：
 * 保持已验收的观感，同时把方向与腕 roll 收归求解器。
 * 只登记需要接管手臂的姿势；未登记的姿势继续走原欧拉路径。
 */
export const POSE_ARM_INTENTS: Readonly<Record<string, ArmPair>> = {
  'pose.arms-hang': HANG,
  'pose.gesture-hang': HANG,
  'pose.idle-body': HANG,
  'pose.stance-hands-front': {
    left: {
      upper: [0.654, -0.754, 0.057],
      lower: [-0.128, -0.962, 0.242],
      palm: [-0.973, 0.228, -0.037],
    },
    right: {
      upper: [-0.661, -0.747, 0.066],
      lower: [0.122, -0.963, 0.241],
      palm: [0.975, 0.218, -0.049],
    },
  },
  'pose.stance-hands-pocket': {
    left: {
      upper: [0.746, -0.666, -0.016],
      lower: [0.298, -0.94, 0.164],
      palm: [-0.989, -0.144, 0.036],
    },
    right: {
      upper: [-0.752, -0.659, 0.012],
      lower: [-0.3, -0.938, 0.175],
      palm: [0.988, -0.154, 0],
    },
  },
  'pose.stance-arms-crossed': {
    left: {
      upper: [0.808, -0.589, -0.011],
      lower: [-0.294, -0.939, 0.181],
      palm: [-0.794, 0.603, -0.073],
    },
    right: {
      upper: [-0.814, -0.581, 0],
      lower: [0.288, -0.941, 0.177],
      palm: [0.799, 0.596, -0.083],
    },
  },
  'pose.shy': {
    left: {
      upper: [0.163, -0.341, 0.926],
      lower: [-0.983, 0.07, 0.167],
      palm: [-0.04, 0.26, -0.965],
    },
    right: {
      upper: [-0.922, -0.128, 0.366],
      lower: [0.586, -0.187, 0.788],
      palm: [0.745, 0.131, -0.654],
    },
  },
};
