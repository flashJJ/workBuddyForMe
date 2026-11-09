/**
 * v3.0 P1：VRM 视线追踪参数（借鉴 Mate-Engine）。
 *
 * 头部水平 45° / 俯仰 30°，脊柱 ±15°；用帧率无关的指数平滑，
 * 避免高刷屏与 30fps 档位下手感不一致。
 */

const DEG = Math.PI / 180;

export const GAZE_LIMITS = {
  headYawDeg: 45,
  headPitchDeg: 30,
  spineYawDeg: 15,
} as const;

/** 平滑系数：越大越快（Mate 的头 10 / 脊柱 25） */
export const GAZE_SMOOTH = { head: 10, spine: 25 } as const;

/** 指针离开后多久回正（与 Live2D 微动作同一量级） */
export const GAZE_IDLE_RESET_MS = 2500;

export interface GazeAngles {
  headYaw: number;
  headPitch: number;
  spineYaw: number;
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

/** 指针归一化到 -1..1（越界输入来自舞台/窗口缩放时兜底） */
export function normalizeGaze(nx: number, ny: number): [number, number] {
  return [
    Math.max(-1, Math.min(1, nx)),
    Math.max(-1, Math.min(1, ny)),
  ];
}

/** 归一化指针 → 头部/脊柱弧度（weight 用于交互动作期间淡出） */
export function gazeAngles(nx: number, ny: number, weight = 1): GazeAngles {
  const [x, y] = normalizeGaze(nx, ny);
  const w = clamp01(weight);
  const zero = (value: number) => (value === 0 ? 0 : value); // 归一化 -0
  return {
    headYaw: zero(x * w * GAZE_LIMITS.headYawDeg * DEG),
    // 屏幕 y 向下为正，three.js 绕 X 正转是抬头 → 取反
    headPitch: zero(-y * w * GAZE_LIMITS.headPitchDeg * DEG),
    spineYaw: zero(x * w * GAZE_LIMITS.spineYawDeg * DEG),
  };
}

/** 帧率无关指数平滑：dt 变化时收敛速度一致 */
export function smoothDamp(
  current: number,
  target: number,
  lambda: number,
  dt: number,
): number {
  if (!(dt > 0) || !(lambda > 0)) return current;
  return current + (target - current) * (1 - Math.exp(-lambda * dt));
}
