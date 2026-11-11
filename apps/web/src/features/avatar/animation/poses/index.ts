import type { PoseDefinition } from '../contracts';
import { ARMS_HANG, ARMS_LIMP } from './arms';
import {
  HEAD_DOWN,
  HEAD_GLANCE_LEFT,
  HEAD_GLANCE_RIGHT,
  HEAD_LIFT,
  HEAD_NEUTRAL,
  HEAD_TILT_LEFT,
  HEAD_TILT_RIGHT,
} from './head';
import { LEGS_DANGLE, LEGS_STAND } from './legs';
import { LAND_SETTLE, SCRUFF_ARCH } from './torso';

export {
  ARMS_HANG,
  ARMS_LIMP,
  HEAD_DOWN,
  HEAD_GLANCE_LEFT,
  HEAD_GLANCE_RIGHT,
  HEAD_LIFT,
  HEAD_NEUTRAL,
  HEAD_TILT_LEFT,
  HEAD_TILT_RIGHT,
  LAND_SETTLE,
  LEGS_DANGLE,
  LEGS_STAND,
  SCRUFF_ARCH,
};

/** 内置姿势注册表；动作/行为只引用这里的 id */
export const POSES: readonly PoseDefinition[] = [
  HEAD_NEUTRAL,
  HEAD_DOWN,
  HEAD_TILT_LEFT,
  HEAD_TILT_RIGHT,
  HEAD_GLANCE_LEFT,
  HEAD_GLANCE_RIGHT,
  HEAD_LIFT,
  ARMS_HANG,
  ARMS_LIMP,
  LEGS_STAND,
  LEGS_DANGLE,
  SCRUFF_ARCH,
  LAND_SETTLE,
];
