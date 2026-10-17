/**
 * 桌宠抛掷物理与贴边回正（v2.2 M3，纯函数，可单测）。
 *
 * 拖拽在桌面壳主进程完成，松手后按释放速度继续滑行并受指数阻尼衰减；接近屏幕
 * 工作区边缘时自动贴边回正。判定口径对齐 VPet 的 Trigger / Check 双层：
 * - **进入阈值**（SNAP_ENTER_PX）：窗口边进入工作区边阈值内才「起意」贴边；
 * - **维持阈值**（SNAP_KEEP_PX）：已起意后再超出就放弃贴边（滞回，避免临界抖动）。
 *
 * 坐标系只用 Electron 全局 DIP（与 pet-drag-controller 同口径）。
 */
import type { Rect } from './pet-state';

export interface PetVelocity {
  x: number;
  y: number;
}

/** 可贴边方向 */
export type PetEdge = 'left' | 'right' | 'top' | 'bottom';

/** 每秒速度保留比例（阻尼）：1 秒后降到 10% */
export const THROW_DAMPING_RETAIN_PER_SECOND = 0.1;
/** 停止阈值（DIP/s）：速度低于即视为停下 */
export const THROW_STOP_SPEED = 90;
/** 速度上限（DIP/s）：防极端甩动一帧跨屏 */
export const THROW_MAX_SPEED = 3200;
/**
 * 贴边进入阈值（DIP）：只收紧到 12——桌宠默认落点距屏幕角约 24px（PET_DEFAULT_MARGIN），
 * 阈值若 ≥ 24 会导致「每次松手都被吸到边上」，表现为一碰就被重置挪走。
 */
export const SNAP_ENTER_PX = 12;
/** 贴边维持阈值（DIP）：已起意后超出即放弃 */
export const SNAP_KEEP_PX = 72;
/**
 * 认定「真实拖拽」的最小累计位移（DIP）：低于此值视为误触——
 * 既不滑行也不贴边。否则一次几像素的误触拖拽就会被按光标扫过的速度「甩」出去，
 * 表现为「鼠标一靠近桌宠就被弹开/自动远离」。
 */
export const THROW_MIN_DRAG_PX = 28;

/** 速度大小（DIP/s） */
export function velocitySpeed(velocity: PetVelocity): number {
  return Math.hypot(velocity.x, velocity.y);
}

/** 速度限幅（保持方向） */
export function clampVelocity(velocity: PetVelocity, max = THROW_MAX_SPEED): PetVelocity {
  const speed = velocitySpeed(velocity);
  if (speed <= max || speed === 0) return velocity;
  const scale = max / speed;
  return { x: velocity.x * scale, y: velocity.y * scale };
}

/** 一步物理：按当前速度位移 dtMs，速度按指数阻尼衰减（返回新对象，不改入参） */
export function stepThrow(
  position: { x: number; y: number },
  velocity: PetVelocity,
  dtMs: number,
): { position: { x: number; y: number }; velocity: PetVelocity } {
  const seconds = dtMs / 1000;
  const decay = Math.pow(THROW_DAMPING_RETAIN_PER_SECOND, seconds);
  return {
    position: { x: position.x + velocity.x * seconds, y: position.y + velocity.y * seconds },
    velocity: { x: velocity.x * decay, y: velocity.y * decay },
  };
}

/** 窗口各边到工作区对应边的有符号距离（≤0 表示已越界/压线） */
function edgeDistances(rect: Rect, area: Rect): Record<PetEdge, number> {
  return {
    left: rect.x - area.x,
    right: area.x + area.width - (rect.x + rect.width),
    top: rect.y - area.y,
    bottom: area.y + area.height - (rect.y + rect.height),
  };
}

/** 阈值内最近的边缘；无则 null */
export function nearestEdgeWithin(rect: Rect, area: Rect, threshold: number): PetEdge | null {
  const distances = edgeDistances(rect, area);
  let best: PetEdge | null = null;
  let bestDistance = Infinity;
  for (const edge of ['left', 'right', 'top', 'bottom'] as const) {
    const d = distances[edge];
    // 越界（负距离）也算「在阈值内」，会被吸附回来
    if (d <= threshold && d < bestDistance) {
      best = edge;
      bestDistance = d;
    }
  }
  return best;
}

/** 指定边缘是否仍在阈值内（维持判定；越界视为仍在） */
export function isEdgeWithin(
  rect: Rect,
  area: Rect,
  edge: PetEdge,
  threshold: number,
): boolean {
  return edgeDistances(rect, area)[edge] <= threshold;
}

/**
 * 贴边目标左上角：水平边贴左/右、垂直边贴上/下，另一轴保持原位。
 * 带 margin 留白（与 pet-state.PET_EDGE_MARGIN 同口径）。
 */
export function edgeSnapPosition(
  rect: Rect,
  area: Rect,
  edge: PetEdge,
  margin: number,
): { x: number; y: number } {
  switch (edge) {
    case 'left':
      return { x: area.x + margin, y: rect.y };
    case 'right':
      return { x: area.x + area.width - rect.width - margin, y: rect.y };
    case 'top':
      return { x: rect.x, y: area.y + margin };
    case 'bottom':
      return { x: rect.x, y: area.y + area.height - rect.height - margin };
  }
}
