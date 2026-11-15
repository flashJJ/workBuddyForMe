/**
 * 坐姿高度锚点与脚踝端点目标（纯数学）。
 *
 * 只解决两件事，不碰骨骼：
 * 1. 髋部要下沉多少：按站立髋高的比例，随模型缩放自适应；
 * 2. 脚踝端点在哪：坐窗沿悬空（垂到腿长以内）/ 坐桌沿落地（回到站立脚踝高）。
 *    脚踝的 x/z 沿用当前坐姿的位置，避免依赖模型朝向的正负号。
 */

export type SeatMode = 'sill' | 'desk';

export interface SeatAnchor {
  mode: SeatMode;
  /** 髋部下沉占站立髋高的比例；缺省见 DEFAULT_DROP_RATIO，0 = 站立 */
  dropRatio?: number;
}

/** 默认下沉比例：按雪团比例标定；换模型可用 dropRatio 覆盖 */
/** 默认下沉比例：按雪团比例标定；换模型可用 dropRatio 覆盖
 *  上限受宠物窗口取景余量约束（下沉过多脚会出画），实测 >0.24 就开始裁脚 */
export const DEFAULT_DROP_RATIO: Readonly<Record<SeatMode, number>> = {
  sill: 0.18,
  desk: 0.2,
};

/** 悬空时脚踝垂到腿长的多少（留一点屈膝余量） */
const DANGLE_RATIO = 0.9;
/** 目标距离上限：不允许超过腿长，避免 IK 强行拉直 */
const MAX_REACH_RATIO = 0.98;

export interface SeatRig {
  /** 站立髋高（模型局部） */
  hipLocalY: number;
  /** 站立脚踝高（模型局部） */
  ankleLocalY: number;
  /** 髋 → 膝 → 踝两段长度之和 */
  legLengthM: number;
}

export interface SeatVec3 {
  x: number;
  y: number;
  z: number;
}

export interface SeatFootTargets {
  left: SeatVec3;
  right: SeatVec3;
}

export interface SeatPlacement {
  /** 场景根节点下沉距离（米，正数 = 下沉） */
  rootDropM: number;
  feet: SeatFootTargets;
}

/** 座位道具（坐面）尺寸：模型局部单位，按髋高缩放 */
export interface SeatPropSpec {
  /** 左右宽度（横向要露出一截，正面才看得出坐在沿上） */
  width: number;
  /** 前后进深 */
  depth: number;
  thickness: number;
  /** 髋中心到坐面的距离 */
  contactDropM: number;
  /** 坐面前缘离髋中心的距离：整体退到裙摆后方，避免从正面切过身体 */
  frontGapM: number;
  color: number;
}

/** 坐窗沿偏宽偏薄（像石台），坐桌沿略窄略厚（像木沿） */
const PROP: Readonly<Record<SeatMode, { width: number; depth: number; thickness: number; color: number }>> = {
  sill: { width: 0.92, depth: 0.46, thickness: 0.07, color: 0xd8cfc3 },
  desk: { width: 0.9, depth: 0.42, thickness: 0.09, color: 0xbe9a74 },
};
/** 坐面在髋中心下方：降到臀部，而不是卡在腰上 */
const CONTACT_DROP_RATIO = 0.13;
/** 前缘对齐髋中心（略让开 2% 髋高）：坐面要托住臀部，不能整块退到身后 */
const FRONT_GAP_RATIO = 0.02;

/** 坐面尺寸按站立髋高缩放，换模型自动适配 */
export function computeSeatProp(mode: SeatMode, rig: SeatRig): SeatPropSpec {
  const spec = PROP[mode];
  const h = rig.hipLocalY;
  return {
    width: h * spec.width,
    depth: h * spec.depth,
    thickness: h * spec.thickness,
    contactDropM: h * CONTACT_DROP_RATIO,
    frontGapM: h * FRONT_GAP_RATIO,
    color: spec.color,
  };
}

function clamp01(value: number, max: number): number {
  return Math.min(max, Math.max(0, value));
}

/** 把目标钳到腿长以内（相对髋部），超出的部分按比例缩回 */
function clampToReach(target: SeatVec3, hip: SeatVec3, legLengthM: number): SeatVec3 {
  const dx = target.x - hip.x;
  const dy = target.y - hip.y;
  const dz = target.z - hip.z;
  const dist = Math.hypot(dx, dy, dz);
  const max = legLengthM * MAX_REACH_RATIO;
  if (dist <= max || dist < 1e-6) return target;
  const k = max / dist;
  return { x: hip.x + dx * k, y: hip.y + dy * k, z: hip.z + dz * k };
}

/**
 * @param hips 当前髋部（模型局部）
 * @param ankles 当前坐姿下的脚踝（模型局部），只借 x/z 作为落脚方位
 */
export function computeSeatPlacement(
  anchor: SeatAnchor,
  rig: SeatRig,
  hips: SeatVec3,
  ankles: SeatFootTargets,
): SeatPlacement {
  const ratio = clamp01(anchor.dropRatio ?? DEFAULT_DROP_RATIO[anchor.mode], 0.8);
  const rootDropM = Math.max(0, rig.hipLocalY * ratio);
  const hipY = hips.y;
  const frame = { x: hips.x, y: hipY - rootDropM, z: hips.z };
  const footY =
    anchor.mode === 'sill' ? frame.y - rig.legLengthM * DANGLE_RATIO : rig.ankleLocalY;
  const feet: SeatFootTargets = {
    left: anchor.mode === 'desk'
      ? groundFoot(ankles.left, frame, footY, rig.legLengthM)
      : clampToReach({ x: ankles.left.x, y: footY, z: ankles.left.z }, frame, rig.legLengthM),
    right: anchor.mode === 'desk'
      ? groundFoot(ankles.right, frame, footY, rig.legLengthM)
      : clampToReach({ x: ankles.right.x, y: footY, z: ankles.right.z }, frame, rig.legLengthM),
  };
  return { rootDropM, feet };
}

/**
 * 落地脚：先保住地面高度，再把前后偏移缩到可达范围。
 * 直接 clamp 整条向量会把脚抬离地面（看起来像悬空），这里只收水平距离。
 */
function groundFoot(foot: SeatVec3, frame: SeatVec3, footY: number, legLengthM: number): SeatVec3 {
  const max = legLengthM * MAX_REACH_RATIO;
  const dy = footY - frame.y;
  const maxHoriz = Math.sqrt(Math.max(0, max * max - dy * dy));
  const dx = foot.x - frame.x;
  const dz = foot.z - frame.z;
  const horiz = Math.hypot(dx, dz);
  const k = horiz > maxHoriz && horiz > 1e-6 ? maxHoriz / horiz : 1;
  return { x: frame.x + dx * k, y: footY, z: frame.z + dz * k };
}
