/**
 * 手臂意图表：所有手臂世界方向与掌心法线的唯一数值来源。
 *
 * 坐标约定（角色本地、未转身）：+X = 角色左侧，+Y = 上，+Z = 面朝方向。
 * 右手目标由 left 镜像得到；`palm` 是掌心法线，省略表示不滚腕。
 *
 * 分工规则：
 * - 行为/姿势层只挑一个意图，不直接写手臂欧拉角；
 * - 骨骼求解由 arms/solver.ts 统一完成（方向 + 掌心 roll）；
 * - 新增动作先在这里加一行，不要在动作文件里散落目标向量。
 */

export type ArmVec = readonly [number, number, number];

export interface ArmIntent {
  /** 大臂 → 肘 的世界方向 */
  upper: ArmVec;
  /** 前臂 → 腕 的世界方向 */
  lower: ArmVec;
  /** 掌心法线（世界方向）；省略 = 保持当前腕 roll */
  palm?: ArmVec;
}

export interface ArmPair {
  left: ArmIntent;
  right: ArmIntent;
}

/** 掌心朝身体中线（左右镜像），略向前 */
export function palmInward(side: 'left' | 'right'): ArmVec {
  return [side === 'left' ? -1 : 1, 0, 0.35];
}

const PALM_DOWN: ArmVec = [0, -1, 0.15];
const PALM_UP: ArmVec = [0, 1, 0.15];
const PALM_FORWARD: ArmVec = [0, -0.1, 1];

/** 自然垂臂：待机 / 手势退出基准 */
export const HANG: ArmPair = {
  left: {
    upper: [0.26, -1, 0.04],
    lower: [0.03, -1, 0.1],
    palm: palmInward('left'),
  },
  right: {
    upper: [-0.26, -1, 0.04],
    lower: [-0.03, -1, 0.1],
    palm: palmInward('right'),
  },
};

/** 伏案撑桌：双手前伸，掌心朝桌面 */
export const LEAN_DESK: ArmPair = {
  left: {
    upper: [0.32, -0.75, 0.5],
    lower: [0.12, -0.35, 0.92],
    palm: PALM_DOWN,
  },
  right: {
    upper: [-0.32, -0.75, 0.5],
    lower: [-0.12, -0.35, 0.92],
    palm: PALM_DOWN,
  },
};

/** 鞠躬：大臂自然下垂附近，小臂略前摆 */
export const BOW: ArmPair = {
  left: {
    upper: [0.2, -0.95, 0.2],
    lower: [0.05, -0.95, 0.3],
    palm: palmInward('left'),
  },
  right: {
    upper: [-0.2, -0.95, 0.2],
    lower: [-0.05, -0.95, 0.3],
    palm: palmInward('right'),
  },
};

/** 叉腰：虎口贴腰，掌心朝内下 */
export const HANDS_ON_HIPS: ArmPair = {
  left: {
    upper: [0.26, -1, 0],
    lower: [-0.22, -0.9, 0.08],
    palm: [-1, -0.2, -0.2],
  },
  right: {
    upper: [-0.26, -1, 0],
    lower: [0.22, -0.9, 0.08],
    palm: [1, -0.2, -0.2],
  },
};

/** 托腮（仅右手）：前臂上折，掌心托住下巴 */
export const CHIN_REST_RIGHT: ArmIntent = {
  upper: [-0.12, -0.95, 0.2],
  lower: [0.18, 0.92, 0.4],
  palm: [0.3, 0.7, 0.3],
};

/** 持杯（仅右手）：手抬到髋前，掌心朝前，杯身落在掌前 */
export const PROP_HOLD_RIGHT: ArmIntent = {
  upper: [-0.35, -0.9, 0.2],
  lower: [0.12, -0.75, 0.65],
  palm: [0, 0, 1],
};

/** 打哈欠（仅右手）：手背掩口，掌心朝向自己 */
export const YAWN_RIGHT: ArmIntent = {
  upper: [-0.1, -0.9, 0.28],
  lower: [0.12, 0.9, 0.35],
  palm: [0.2, 0.8, 0.35],
};

/** 拥抱：双手环到胸前，掌心相对 */
export const HUG: ArmPair = {
  left: {
    upper: [0.32, -0.88, 0.28],
    lower: [-0.35, 0.12, 0.93],
    palm: [-0.9, 0.05, 0.2],
  },
  right: {
    upper: [-0.32, -0.88, 0.28],
    lower: [0.35, 0.12, 0.93],
    palm: [0.9, 0.05, 0.2],
  },
};

/** 伸懒腰三段路径：垂臂 → 前平举 → 上举 */
export const STRETCH_DOWN: ArmPair = HANG;
export const STRETCH_FORWARD: ArmPair = {
  left: {
    upper: [0.3, -0.15, 0.95],
    lower: [0.25, 0.25, 0.93],
    palm: PALM_DOWN,
  },
  right: {
    upper: [-0.3, -0.15, 0.95],
    lower: [-0.25, 0.25, 0.93],
    palm: PALM_DOWN,
  },
};
export const STRETCH_UP: ArmPair = {
  left: {
    upper: [0.22, 0.9, 0.3],
    lower: [0.18, 0.95, 0.22],
    palm: PALM_FORWARD,
  },
  right: {
    upper: [-0.22, 0.9, 0.3],
    lower: [-0.18, 0.95, 0.22],
    palm: PALM_FORWARD,
  },
};

/** 干饭端碗：双手在胸前，掌心向上 */
export const EAT_HOLD: ArmPair = {
  left: {
    upper: [0.24, -0.92, 0.22],
    lower: [-0.18, 0.12, 0.96],
    palm: [-0.2, 1, 0.1],
  },
  right: {
    upper: [-0.24, -0.92, 0.22],
    lower: [0.18, 0.12, 0.96],
    palm: [0.2, 1, 0.1],
  },
};

/** 干饭送口（仅右手）：前臂抬到嘴边，掌心向上托食物 */
export const EAT_BITE_RIGHT: ArmIntent = {
  upper: [-0.25, -0.85, 0.3],
  lower: [0.12, 0.82, 0.5],
  palm: [0.2, 0.8, 0.4],
};

/** 生气叉腰：双手扶髋，大臂比普通叉腰略外张 */
export const SCOLD_HUFF: ArmPair = {
  left: {
    upper: [0.34, -0.94, 0],
    lower: [-0.26, -0.86, 0.12],
    palm: [-1, -0.25, -0.2],
  },
  right: {
    upper: [-0.34, -0.94, 0],
    lower: [0.26, -0.86, 0.12],
    palm: [1, -0.25, -0.2],
  },
};

/** 悬空垂臂：被拎起时手臂松垂、掌心相对 */
export const LIFT_ARM: ArmPair = {
  left: {
    upper: [0.28, -1, -0.1],
    lower: [0.1, -1, 0.12],
    palm: [-0.9, 0.1, -0.3],
  },
  right: {
    upper: [-0.28, -1, -0.1],
    lower: [-0.1, -1, 0.12],
    palm: [0.9, 0.1, -0.3],
  },
};
