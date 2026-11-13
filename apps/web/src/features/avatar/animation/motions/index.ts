import type { MotionDefinition } from '../contracts';
import { EAT_BITE_MOTION } from './eating';
import { REACT_FLINCH_MOTION } from './flinch';
import { SHY_MOTION, STOMP, STRETCH_UP, WAVE } from './gestures';
import { GLANCE } from './glance';
import { HAND_FIDGET_LEFT, HAND_FIDGET_RIGHT } from './hand-fidget';
import { LOOK_AROUND, NOD_DOUBLE, SHAKE } from './head-gestures';
import { NOD } from './nod';
import { ARMS_CROSSED_MOTION, BOW_MOTION, HANDS_FRONT_MOTION, HANDS_POCKET_MOTION, HUG_MOTION, LEAN_WALL_MOTION, TIPTOE_MOTION, YAWN_MOTION } from './postures';
import { STANCE_SWAY } from './sway';
import { TILT } from './tilt';

export {
  ARMS_CROSSED_MOTION,
  BOW_MOTION,
  EAT_BITE_MOTION,
  GLANCE,
  HAND_FIDGET_LEFT,
  HAND_FIDGET_RIGHT,
  HANDS_FRONT_MOTION,
  HANDS_POCKET_MOTION,
  HUG_MOTION,
  LEAN_WALL_MOTION,
  LOOK_AROUND,
  NOD,
  NOD_DOUBLE,
  REACT_FLINCH_MOTION,
  SHAKE,
  SHY_MOTION,
  STANCE_SWAY,
  STOMP,
  STRETCH_UP,
  TILT,
  TIPTOE_MOTION,
  WAVE,
  YAWN_MOTION,
};

/** 内置动作注册表；数据只引用 contracts 里的 id */
export const MOTIONS: readonly MotionDefinition[] = [
  NOD,
  TILT,
  GLANCE,
  HAND_FIDGET_LEFT,
  HAND_FIDGET_RIGHT,
  STANCE_SWAY,
  REACT_FLINCH_MOTION,
  // v3.0 内容扩容：头部手势 / 社交身体 / 进食
  NOD_DOUBLE,
  SHAKE,
  LOOK_AROUND,
  WAVE,
  SHY_MOTION,
  STRETCH_UP,
  STOMP,
  EAT_BITE_MOTION,
  // 站姿社交动作扩容（复用 L1 姿势）
  HANDS_FRONT_MOTION,
  HANDS_POCKET_MOTION,
  ARMS_CROSSED_MOTION,
  LEAN_WALL_MOTION,
  TIPTOE_MOTION,
  // P5.5：鞠躬 / 打哈欠 / 拥抱
  BOW_MOTION,
  YAWN_MOTION,
  HUG_MOTION,
];
