/**
 * v2.20 M3 Light UI 几何：端点、控制点、缓动与路径采样。
 * 纯函数，无 DOM/React；像素坐标由调用方决定。
 */

export interface Point {
  x: number;
  y: number;
}

export interface CubicCurve {
  from: Point;
  c1: Point;
  c2: Point;
  to: Point;
}

export interface RectLike {
  left: number;
  top: number;
  width: number;
  height: number;
}

const MIN_CURVE_OFFSET = 6;

export function distance(a: Point, b: Point): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

export function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

/** 两端慢、中段快的缓动，t∈[0,1] */
export function easeInOutCubic(t: number): number {
  const value = clamp01(t);
  return value < 0.5 ? 4 * value * value * value : 1 - (-2 * value + 2) ** 3 / 2;
}

export function rectCenter(rect: RectLike): Point {
  return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
}

/** 字符串稳定哈希 → [0,1)，用于固定同一光线的弯曲方向 */
export function seedFromString(value: string): number {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return ((hash >>> 0) % 1000) / 1000;
}

/**
 * 三次贝塞尔：两端切线沿路径方向，控制点沿法线偏移形成轻微弧线。
 * seed 控制弯曲方向与幅度，同 seed 结果稳定。
 */
export function buildCurve(from: Point, to: Point, seed = 0.5, curvature = 0.18): CubicCurve {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const length = Math.hypot(dx, dy) || 1;
  const nx = -dy / length;
  const ny = dx / length;
  const safeSeed = Number.isFinite(seed) ? clamp01(seed) : 0.5;
  const direction = safeSeed < 0.5 ? -1 : 1;
  const offset = Math.max(MIN_CURVE_OFFSET, length * curvature * (0.6 + Math.abs(safeSeed - 0.5)));
  const bend = offset * direction;

  return {
    from: { x: from.x, y: from.y },
    c1: { x: from.x + dx * 0.25 + nx * bend, y: from.y + dy * 0.25 + ny * bend },
    c2: { x: to.x - dx * 0.25 + nx * bend, y: to.y - dy * 0.25 + ny * bend },
    to: { x: to.x, y: to.y },
  };
}

export function pointOnCurve(curve: CubicCurve, t: number): Point {
  const value = clamp01(t);
  const inverse = 1 - value;
  const a = inverse ** 3;
  const b = 3 * inverse * inverse * value;
  const c = 3 * inverse * value * value;
  const d = value ** 3;
  return {
    x: a * curve.from.x + b * curve.c1.x + c * curve.c2.x + d * curve.to.x,
    y: a * curve.from.y + b * curve.c1.y + c * curve.c2.y + d * curve.to.y,
  };
}

export function curvePath(curve: CubicCurve): string {
  const { from, c1, c2, to } = curve;
  return `M ${round(from.x)} ${round(from.y)} C ${round(c1.x)} ${round(c1.y)}, ${round(c2.x)} ${round(c2.y)}, ${round(to.x)} ${round(to.y)}`;
}

/** 曲线 t0→t1 的折线路径（光线尾迹用，避免依赖 getTotalLength） */
export function segmentPath(curve: CubicCurve, t0: number, t1: number, steps = 8): string {
  const start = clamp01(Math.min(t0, t1));
  const end = clamp01(Math.max(t0, t1));
  if (end - start <= 0) {
    const point = pointOnCurve(curve, start);
    return `M ${round(point.x)} ${round(point.y)}`;
  }
  const parts: string[] = [];
  for (let i = 0; i <= steps; i += 1) {
    const point = pointOnCurve(curve, start + ((end - start) * i) / steps);
    parts.push(`${i === 0 ? 'M' : 'L'} ${round(point.x)} ${round(point.y)}`);
  }
  return parts.join(' ');
}

function round(value: number): string {
  return Number.isFinite(value) ? value.toFixed(2) : '0';
}
