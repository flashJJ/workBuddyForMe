/**
 * 桌宠抛掷控制器（v2.2 M3）：松手后按释放速度滑行 + 阻尼衰减 + 贴边回正。
 *
 * - 位置仍由主进程独占（与拖拽同口径，渲染端不发坐标）；
 * - 定时器/工作区/窗口均注入，纯逻辑可单测；
 * - 滑行期间每帧把窗口约束在当前工作区内（不会飞出屏幕），停下后若已「起意」贴边则回正。
 */
import { PET_EDGE_MARGIN, type Rect } from './pet-state';
import type { PetDragWindow } from './pet-drag-controller';
import {
  clampVelocity,
  edgeSnapPosition,
  isEdgeWithin,
  nearestEdgeWithin,
  stepThrow,
  velocitySpeed,
  SNAP_ENTER_PX,
  SNAP_KEEP_PX,
  THROW_MIN_DRAG_PX,
  THROW_STOP_SPEED,
  type PetEdge,
  type PetVelocity,
} from './pet-throw-physics';

/** 抛掷帧间隔（约 60fps） */
export const THROW_FRAME_MS = 16;

export interface PetThrowDeps {
  /** 测试注入：帧定时器（默认 setInterval/clearInterval） */
  setInterval?: typeof setInterval;
  clearInterval?: typeof clearInterval;
  /** 窗口当前所在工作区（多屏随窗口位置变化）；返回 null 表示不可判定（跳过贴边判定） */
  getWorkArea: (bounds: Rect) => Rect | null;
  /** 滑行/贴边结束（含无需滑行）后回调，manager 持久化最终位置 */
  onSettle: (win: PetDragWindow) => void;
  /** 窗口规范尺寸（DIP）：滑行/贴边时钉住尺寸，避免拿漂移后的 getBounds 尺寸回写（棘轮） */
  getFixedSize?: () => { width: number; height: number } | null;
  /** 可选调试输出（真机排查用；测试不传则静默） */
  log?: (message: string) => void;
}

export class PetThrowController {
  private timer: ReturnType<typeof setInterval> | null = null;
  private velocity: PetVelocity | null = null;
  private snapEdge: PetEdge | null = null;

  constructor(private readonly deps: PetThrowDeps) {}

  isThrowing(): boolean {
    return this.timer !== null;
  }

  /**
   * 松手：速度够快则滑行；否则只做贴边回正 + 落位持久化。
   * `dragDistance` 为本次拖拽累计位移——**低于 THROW_MIN_DRAG_PX 视为误触**：
   * 直接落位、不滑行也不贴边（否则几像素误触就会被按光标速度甩出去）。
   */
  start(win: PetDragWindow | null, velocity: PetVelocity, dragDistance = Number.POSITIVE_INFINITY): void {
    if (!win || win.isDestroyed()) return;
    // 防御：任何情况下先清掉可能仍在跑的定时器，保证同一时刻只有一个滑行循环
    this.stop();
    const b = win.getBounds();
    this.deps.log?.(
      `start dist=${Math.round(dragDistance)} v=${Math.round(velocity.x)},${Math.round(velocity.y)} bounds=${b.x},${b.y} ${b.width}x${b.height}`,
    );
    if (dragDistance < THROW_MIN_DRAG_PX) {
      this.deps.log?.(`skip: 误触（dist<${THROW_MIN_DRAG_PX}）`);
      this.deps.onSettle(win);
      return;
    }
    const clamped = clampVelocity(velocity);
    if (velocitySpeed(clamped) < THROW_STOP_SPEED) {
      this.settle(win);
      return;
    }
    this.velocity = clamped;
    this.snapEdge = null;
    const setter = this.deps.setInterval ?? setInterval;
    this.timer = setter(() => this.tick(win), THROW_FRAME_MS);
  }

  /** 强制停止（关窗/换模型/退出）：不落位、不回调 */
  stop(): void {
    if (this.timer === null) return;
    const clearer = this.deps.clearInterval ?? clearInterval;
    clearer(this.timer);
    this.timer = null;
    this.velocity = null;
    this.snapEdge = null;
    this.deps.log?.('stop');
  }

  /** 单帧推进：位移 + 阻尼 → 约束进工作区 → 贴边起意/维持 → 速度衰减到阈值即落位 */
  private tick(win: PetDragWindow): void {
    if (win.isDestroyed()) {
      this.stop();
      return;
    }
    const velocity = this.velocity;
    if (!velocity) {
      this.stop();
      return;
    }
    const bounds = win.getBounds();
    const size = this.deps.getFixedSize?.() ?? { width: bounds.width, height: bounds.height };
    const area = this.deps.getWorkArea(bounds);
    if (!area) {
      this.stop();
      this.deps.onSettle(win);
      return;
    }

    const stepped = stepThrow({ x: bounds.x, y: bounds.y }, velocity, THROW_FRAME_MS);
    const point = clampIntoArea(stepped.position, size, area);
    this.applyPosition(win, point, size);
    this.velocity = stepped.velocity;

    const rect: Rect = { x: point.x, y: point.y, ...size };
    // 进入阈值起意 → 维持阈值内保持，超出即放弃（滞回防抖）
    this.snapEdge = this.snapEdge
      ? isEdgeWithin(rect, area, this.snapEdge, SNAP_KEEP_PX)
        ? this.snapEdge
        : null
      : nearestEdgeWithin(rect, area, SNAP_ENTER_PX);

    if (velocitySpeed(stepped.velocity) < THROW_STOP_SPEED) {
      if (this.snapEdge) {
        const snap = edgeSnapPosition(rect, area, this.snapEdge, PET_EDGE_MARGIN);
        this.deps.log?.(
          `snap(${this.snapEdge}) from=${point.x},${point.y} to=${Math.round(snap.x)},${Math.round(snap.y)}`,
        );
        this.applyPosition(win, snap, size);
      }
      this.stop();
      this.deps.onSettle(win);
    }
  }

  /** 无速度/已停下：边缘阈值内才贴边回正，然后持久化 */
  private settle(win: PetDragWindow): void {
    const bounds = win.getBounds();
    const size = this.deps.getFixedSize?.() ?? { width: bounds.width, height: bounds.height };
    const area = this.deps.getWorkArea(bounds);
    if (area) {
      const rect: Rect = { x: bounds.x, y: bounds.y, ...size };
      const edge = nearestEdgeWithin(rect, area, SNAP_ENTER_PX);
      if (edge) {
        const snap = edgeSnapPosition(rect, area, edge, PET_EDGE_MARGIN);
        this.deps.log?.(`snap(${edge}) from=${rect.x},${rect.y} to=${snap.x},${snap.y}`);
        this.applyPosition(win, snap, size);
      } else {
        this.deps.log?.(`settle no-snap at=${rect.x},${rect.y}`);
      }
    }
    this.deps.onSettle(win);
  }

  /** 有 setBounds 时原子设置位置+尺寸（防跨 DPI 尺寸棘轮，与拖拽同口径） */
  private applyPosition(
    win: PetDragWindow,
    point: { x: number; y: number },
    size: { width: number; height: number },
  ): void {
    const x = Math.round(point.x);
    const y = Math.round(point.y);
    if (win.setBounds) win.setBounds({ x, y, width: size.width, height: size.height });
    else win.setPosition(x, y);
  }
}

/** 把点约束进工作区（保留 PET_EDGE_MARGIN）；越界夹紧而非跳角 */
function clampIntoArea(
  point: { x: number; y: number },
  size: { width: number; height: number },
  area: Rect,
): { x: number; y: number } {
  return {
    x: clampInt(point.x, area.x + PET_EDGE_MARGIN, area.x + area.width - size.width - PET_EDGE_MARGIN),
    y: clampInt(point.y, area.y + PET_EDGE_MARGIN, area.y + area.height - size.height - PET_EDGE_MARGIN),
  };
}

/** min > max（屏幕比窗口小）时锚到左上边界 */
function clampInt(value: number, min: number, max: number): number {
  if (min > max) return min;
  return Math.min(Math.max(value, min), max);
}
