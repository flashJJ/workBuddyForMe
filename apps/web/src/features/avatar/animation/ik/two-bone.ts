/**
 * M0d：两骨解析 IK（纯数学，不依赖 three）。
 *
 * 用于肩→肘→腕、髋→膝→踝这类两段链：给定根位置、末端目标与极点方向，
 * 求肘/膝位置。零迭代、开销固定，适合 Electron 实时交互；
 * 超出手臂长度时钳位到可达范围，不产生 NaN。
 */

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export interface TwoBoneSolution {
  /** 肘/膝关节位置 */
  joint: Vec3;
  /** 钳位后的末端位置 */
  end: Vec3;
  /** 目标是否在可达范围内 */
  reachable: boolean;
}

const EPS = 1e-6;

function perpendicular(nx: number, ny: number, nz: number): Vec3 {
  // 任选一个与 n 不平行的轴叉乘，保证退化输入也有确定的弯曲平面
  const ax = Math.abs(nx) < 0.9 ? 1 : 0;
  const ay = Math.abs(nx) < 0.9 ? 0 : 1;
  let px = ny * 0 - nz * ay;
  let py = nz * ax - nx * 0;
  let pz = nx * ay - ny * ax;
  const len = Math.hypot(px, py, pz) || 1;
  px /= len;
  py /= len;
  pz /= len;
  return { x: px, y: py, z: pz };
}

/**
 * @param root 上臂/大腿根位置（世界空间）
 * @param target 末端目标（世界空间）
 * @param pole 弯曲方向参考点（世界空间，通常取当前肘/膝位置）
 * @param upperLength 上段长度
 * @param lowerLength 下段长度
 */
export function solveTwoBone(
  root: Vec3,
  target: Vec3,
  pole: Vec3 | null,
  upperLength: number,
  lowerLength: number,
): TwoBoneSolution {
  const l1 = Math.max(EPS, upperLength);
  const l2 = Math.max(EPS, lowerLength);
  const dx = target.x - root.x;
  const dy = target.y - root.y;
  const dz = target.z - root.z;
  const rawDist = Math.hypot(dx, dy, dz);
  const maxDist = l1 + l2 - EPS;
  const minDist = Math.abs(l1 - l2) + EPS;
  const dist = Math.min(maxDist, Math.max(minDist, rawDist));
  const reachable = rawDist >= minDist && rawDist <= maxDist;

  // 目标与根重合时给一个向下兜底方向，避免除零
  const nx = rawDist > EPS ? dx / rawDist : 0;
  const ny = rawDist > EPS ? dy / rawDist : -1;
  const nz = rawDist > EPS ? dz / rawDist : 0;

  const ux = nx;
  const uy = ny;
  const uz = nz;

  let bend: Vec3;
  if (pole) {
    let px = pole.x - root.x;
    let py = pole.y - root.y;
    let pz = pole.z - root.z;
    const projection = px * ux + py * uy + pz * uz;
    px -= ux * projection;
    py -= uy * projection;
    pz -= uz * projection;
    const length = Math.hypot(px, py, pz);
    bend = length > EPS
      ? { x: px / length, y: py / length, z: pz / length }
      : perpendicular(ux, uy, uz);
  } else {
    bend = perpendicular(ux, uy, uz);
  }

  const along = (l1 * l1 - l2 * l2 + dist * dist) / (2 * dist);
  const height = Math.sqrt(Math.max(0, l1 * l1 - along * along));

  return {
    joint: {
      x: root.x + ux * along + bend.x * height,
      y: root.y + uy * along + bend.y * height,
      z: root.z + uz * along + bend.z * height,
    },
    end: {
      x: root.x + ux * dist,
      y: root.y + uy * dist,
      z: root.z + uz * dist,
    },
    reachable,
  };
}

/** 世界空间方向（单位向量）；远端与关节重合时返回 null */
export function direction(from: Vec3, to: Vec3): Vec3 | null {
  const x = to.x - from.x;
  const y = to.y - from.y;
  const z = to.z - from.z;
  const length = Math.hypot(x, y, z);
  if (length < EPS) return null;
  return { x: x / length, y: y / length, z: z / length };
}

/** 软 IK 的先验姿态：当前/参考末端与肘膝位置 */
export interface PriorConstraint {
  /** 参考末端位置（世界空间） */
  end: Vec3;
  /** 参考肘/膝位置：用于保持原有弯曲平面 */
  joint?: Vec3 | null;
  /** 0..1；越大越愿意「够不到」，优先保持基准姿态 */
  relax: number;
}

function lerpVec(a: Vec3, b: Vec3, t: number): Vec3 {
  return {
    x: a.x + (b.x - a.x) * t,
    y: a.y + (b.y - a.y) * t,
    z: a.z + (b.z - a.z) * t,
  };
}

/**
 * Soft IK 的目标收缩：把末端目标向基准末端插值，极点向基准关节插值。
 *
 * 对应「IK 代价 = 末端距离 + 姿势偏离正则」的闭式近似：
 * relax=0 退化为硬 IK；relax=1 完全不追目标，保持基准姿态。
 * 比在求解器里加迭代项更省，也不会破坏 `solveTwoBone` 的确定性。
 */
export function softenTarget(
  target: Vec3,
  pole: Vec3 | null,
  prior: PriorConstraint,
): { target: Vec3; pole: Vec3 | null } {
  const relax = Math.max(0, Math.min(1, prior.relax));
  if (relax <= 0) return { target, pole };
  return {
    target: lerpVec(target, prior.end, relax),
    pole: pole && prior.joint ? lerpVec(pole, prior.joint, relax) : pole,
  };
}

/** 带先验正则的两骨 IK；语义与 `solveTwoBone` 一致，只是目标被软化 */
export function solveTwoBoneSoft(
  root: Vec3,
  target: Vec3,
  pole: Vec3 | null,
  upperLength: number,
  lowerLength: number,
  prior: PriorConstraint,
): TwoBoneSolution {
  const softened = softenTarget(target, pole, prior);
  return solveTwoBone(root, softened.target, softened.pole, upperLength, lowerLength);
}
