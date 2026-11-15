/**
 * 程序化手势与头部环境漂移（纯函数，便于单测）。
 *
 * 动作池为空时，点击与待机只能靠姿态层做程序化反馈：
 * 这里提供点头/歪头/瞥一眼三种轻量手势，以及两个不同周期的低频漂移，
 * 避免待机像摆件、也避免单一正弦的机械节拍。
 */

export type ProceduralGestureKind = 'nod' | 'tilt' | 'glanceLeft' | 'glanceRight';

/** 手势时长（ms）：短促但不突兀 */
export const GESTURE_DURATION_MS: Record<ProceduralGestureKind, number> = {
  nod: 520,
  tilt: 760,
  glanceLeft: 1100,
  glanceRight: 1100,
};

export interface GestureAngles {
  yaw: number;
  pitch: number;
  roll: number;
}

const ZERO: GestureAngles = { yaw: 0, pitch: 0, roll: 0 };

/** 手势进度（0..1）→ 叠加角度；sin 包络保证首尾归零、无跳变 */
export function gestureAngles(kind: ProceduralGestureKind, progress: number): GestureAngles {
  if (progress <= 0 || progress >= 1) return ZERO;
  const envelope = Math.sin(Math.PI * progress);
  switch (kind) {
    case 'nod':
      return { yaw: 0, pitch: envelope * 0.13, roll: 0 };
    case 'tilt':
      return { yaw: envelope * 0.05, pitch: envelope * 0.02, roll: envelope * 0.16 };
    case 'glanceLeft':
      return { yaw: envelope * 0.11, pitch: -envelope * 0.01, roll: 0 };
    case 'glanceRight':
      return { yaw: -envelope * 0.11, pitch: -envelope * 0.01, roll: 0 };
  }
}

/** 无动作池时点击的手势：点头/歪头各半 */
export function pickTapGesture(random = Math.random()): ProceduralGestureKind {
  return random < 0.5 ? 'nod' : 'tilt';
}

/** 无 VRMA 手势时点击的内部 MOTION 回退：挥手/害羞 */
export function pickMotionGesture(random = Math.random()): string {
  return random < 0.5 ? 'motion.wave' : 'motion.shy';
}

/** 环境微行为：眨眼也走同一调度，保证间歇有反应 */
export type AmbientBehavior = ProceduralGestureKind | 'blink';

export function pickAmbientBehavior(random = Math.random()): AmbientBehavior {
  if (random < 0.3) return 'blink';
  if (random < 0.55) return 'nod';
  if (random < 0.8) return 'tilt';
  return random < 0.9 ? 'glanceLeft' : 'glanceRight';
}

/** 头部低频漂移：两个周期叠加，幅度约 1–2°，远低于视线跟随上限 */
export function ambientHeadAngles(t: number): { yaw: number; pitch: number } {
  return {
    yaw: Math.sin(t * 0.12) * 0.035 + Math.sin(t * 0.29 + 1.7) * 0.014,
    pitch: Math.sin(t * 0.19 + 0.6) * 0.016,
  };
}

/** 手势播放状态：姿态层每帧 update，到期自动归零（复用同一角度对象，零分配） */
export class GestureState {
  readonly angles: GestureAngles = { yaw: 0, pitch: 0, roll: 0 };
  private kind: ProceduralGestureKind | null = null;
  private startedAt = 0;

  play(kind: ProceduralGestureKind, now = performance.now()): void {
    this.kind = kind;
    this.startedAt = now;
  }

  update(now = performance.now()): GestureAngles {
    if (!this.kind) return ZERO;
    const progress = (now - this.startedAt) / GESTURE_DURATION_MS[this.kind];
    if (progress >= 1) {
      this.kind = null;
      this.angles.yaw = 0;
      this.angles.pitch = 0;
      this.angles.roll = 0;
      return this.angles;
    }
    const next = gestureAngles(this.kind, progress);
    this.angles.yaw = next.yaw;
    this.angles.pitch = next.pitch;
    this.angles.roll = next.roll;
    return this.angles;
  }

  get active(): boolean {
    return this.kind !== null;
  }

  /** 立即清空当前手势（转身背对时避免头部还在做动作） */
  reset(): void {
    this.kind = null;
    this.angles.yaw = 0;
    this.angles.pitch = 0;
    this.angles.roll = 0;
  }
}
