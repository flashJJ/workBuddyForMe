/**
 * 桌宠窗口坐立（v3.0 P1）。
 *
 * 拖拽 ≥1s 后松手，若脚底落在某个可见窗口顶边 / 底部任务栏上沿 ±24 DIP 内，
 * 则吸附到该边缘并每 125ms 跟随（目标窗口移动、任务栏位置变化）。
 * 再次拖拽立即解除；坐标全部为 DIP，与 Electron screen API 一致。
 */
import { listWindowEdges, type WindowEdge } from './win32-windows';

export interface SitRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface PetSitWindow {
  isDestroyed(): boolean;
  getBounds(): SitRect;
  setBounds?(bounds: SitRect): void;
  setPosition(x: number, y: number): void;
}

export interface PetSitDeps {
  /** 桌宠窗固定尺寸（DIP），移动时必须回写，避免透明窗跨 DPI 棘轮变大 */
  getFixedSize: () => { width: number; height: number };
  getWorkArea: (bounds: SitRect) => SitRect | null;
  /** 显示器完整 bounds（判定底部任务栏）；缺省时不做任务栏坐立 */
  getDisplayBounds?: (bounds: SitRect) => SitRect | null;
  /** 可坐窗口列表（DIP）；缺省/空数组时只做任务栏 */
  listWindows?: () => WindowEdge[];
  setInterval?: typeof setInterval;
  clearInterval?: typeof clearInterval;
  now?: () => number;
  /** 首次吸附到位 / 跟随稳定后回调（manager 用于持久化位置） */
  onSettle?: (win: PetSitWindow) => void;
  log?: (message: string) => void;
}

/** 脚底与边缘的最大探测距离（DIP） */
export const SIT_PROBE_PX = 24;
/** 拖拽至少持续多久才允许坐下（防止路过窗口顶边就吸附） */
export const SIT_MIN_DRAG_MS = 1000;
/** 解除吸附后的冷却（ms） */
export const SIT_RELEASE_COOLDOWN_MS = 300;
/** 跟随刷新间隔（约 8fps，足够跟随窗口拖动） */
export const SIT_FOLLOW_MS = 125;
/** 吸附平滑时间与最大速度 */
export const SIT_SMOOTH_TIME_MS = 120;
export const SIT_MAX_SPEED_PX_S = 6000;
/** 水平方向至少要有多少像素落在平台内才算可坐 */
const SIDE_MARGIN = 8;
const EPSILON = 2;

interface SitTarget {
  /** null = 任务栏；数字 = Win32 HWND */
  handle: number | null;
  kind: 'window' | 'taskbar';
  edgeY: number;
  left: number;
  right: number;
  /** 坐下时桌宠相对平台左边的偏移，窗口横移时带着桌宠走 */
  offsetX: number;
}

export class PetSitController {
  private dragStartedAt = -1;
  private cooldownUntil = 0;
  private target: SitTarget | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private settled = false;

  constructor(private readonly deps: PetSitDeps) {}

  isSitting(): boolean {
    return this.target !== null;
  }

  /** 拖拽开始：解除跟随并进入 0.3s 冷却，同时记录拖拽起点 */
  beginDrag(): void {
    this.stop();
    this.dragStartedAt = this.now();
    this.cooldownUntil = this.now() + SIT_RELEASE_COOLDOWN_MS;
  }

  /** 松手尝试坐边：命中返回 true（调用方跳过抛掷） */
  trySit(win: PetSitWindow): boolean {
    if (this.dragStartedAt < 0 || win.isDestroyed()) return false;
    if (this.now() - this.dragStartedAt < SIT_MIN_DRAG_MS) return false;
    if (this.now() < this.cooldownUntil) return false;
    const target = this.findTarget(win);
    if (!target) return false;
    this.target = target;
    this.settled = false;
    this.deps.log?.(`sit ${target.kind} edge=${Math.round(target.edgeY)}`);
    this.follow(win);
    this.startFollowing(win);
    return true;
  }

  /** 停止跟随并清除目标（拖拽/换窗/关闭时调用；已吸附位置保持不动） */
  stop(): void {
    this.stopTimer();
    this.target = null;
  }

  private findTarget(win: PetSitWindow): SitTarget | null {
    const bounds = win.getBounds();
    const feet = bounds.y + bounds.height;
    const centerX = bounds.x + bounds.width / 2;
    const displayTop = this.deps.getDisplayBounds?.(bounds)?.y ?? -Infinity;
    const candidates: SitTarget[] = [];
    for (const edge of this.listEdges()) {
      const { rect } = edge;
      // 角色必须完整落在屏幕内：顶边太高的窗口不坐（否则窗口会被推到屏幕外）
      if (rect.y - bounds.height < displayTop) continue;
      if (centerX < rect.x + SIDE_MARGIN || centerX > rect.x + rect.width - SIDE_MARGIN) continue;
      if (Math.abs(rect.y - feet) > SIT_PROBE_PX) continue;
      candidates.push({
        handle: edge.handle,
        kind: 'window',
        edgeY: rect.y,
        left: rect.x,
        right: rect.x + rect.width,
        offsetX: bounds.x - rect.x,
      });
    }
    const taskbar = this.taskbarTarget(bounds);
    if (taskbar) candidates.push(taskbar);
    return (
      candidates.sort((a, b) => Math.abs(a.edgeY - feet) - Math.abs(b.edgeY - feet))[0] ?? null
    );
  }

  /** 底部任务栏：工作区底边低于显示器底边时，把任务栏上沿当作坐面 */
  private taskbarTarget(bounds: SitRect): SitTarget | null {
    const workArea = this.deps.getWorkArea(bounds);
    const display = this.deps.getDisplayBounds?.(bounds) ?? null;
    if (!workArea || !display) return null;
    const taskbarHeight = display.y + display.height - (workArea.y + workArea.height);
    if (taskbarHeight <= 0) return null;
    const edgeY = workArea.y + workArea.height;
    if (Math.abs(edgeY - (bounds.y + bounds.height)) > SIT_PROBE_PX) return null;
    return {
      handle: null,
      kind: 'taskbar',
      edgeY,
      left: workArea.x,
      right: workArea.x + workArea.width,
      offsetX: bounds.x - workArea.x,
    };
  }

  private startFollowing(win: PetSitWindow): void {
    this.stopTimer();
    const setter = this.deps.setInterval ?? setInterval;
    this.timer = setter(() => this.tick(win), SIT_FOLLOW_MS);
  }

  private stopTimer(): void {
    if (!this.timer) return;
    const clearer = this.deps.clearInterval ?? clearInterval;
    clearer(this.timer);
    this.timer = null;
  }

  private tick(win: PetSitWindow): void {
    if (!this.target || win.isDestroyed()) {
      this.stop();
      return;
    }
    const refreshed = this.refreshTarget(win);
    if (!refreshed) {
      // 目标窗口消失：停止跟随，桌宠留在当前位置
      this.stop();
      return;
    }
    this.target = refreshed;
    this.follow(win);
  }

  private refreshTarget(win: PetSitWindow): SitTarget | null {
    const current = this.target;
    if (!current) return null;
    if (current.handle === null) return this.taskbarTarget(win.getBounds());
    const edge = this.listEdges().find((item) => item.handle === current.handle);
    if (!edge) return null;
    return {
      ...current,
      edgeY: edge.rect.y,
      left: edge.rect.x,
      right: edge.rect.x + edge.rect.width,
    };
  }

  private listEdges(): WindowEdge[] {
    return (this.deps.listWindows ?? listWindowEdges)();
  }

  /** 向目标边缘平滑移动；到位后回调一次 onSettle */
  private follow(win: PetSitWindow): void {
    const target = this.target;
    if (!target) return;
    const size = this.deps.getFixedSize();
    const bounds = win.getBounds();
    const display = this.deps.getDisplayBounds?.(bounds) ?? null;
    const targetY = target.edgeY - size.height;
    if (display && targetY < display.y) {
      // 目标窗口上移/最大化后没有站立空间：解除跟随，留在当前位置
      this.stop();
      return;
    }
    const minX = Math.max(target.left + SIDE_MARGIN, display?.x ?? -Infinity);
    const maxX = Math.min(
      target.right - SIDE_MARGIN - size.width,
      display ? display.x + display.width - SIDE_MARGIN - size.width : Infinity,
    );
    const targetX =
      maxX >= minX
        ? Math.min(maxX, Math.max(minX, target.left + target.offsetX))
        : Math.round((target.left + target.right - size.width) / 2);
    const alpha = 1 - Math.exp(-SIT_FOLLOW_MS / SIT_SMOOTH_TIME_MS);
    const maxStep = SIT_MAX_SPEED_PX_S * (SIT_FOLLOW_MS / 1000);
    const nextX = Math.round(bounds.x + clamp(targetX - bounds.x, maxStep) * alpha);
    const nextY = Math.round(bounds.y + clamp(targetY - bounds.y, maxStep) * alpha);
    if (Math.abs(targetX - nextX) <= EPSILON && Math.abs(targetY - nextY) <= EPSILON) {
      this.applyBounds(win, targetX, targetY, size);
      this.settle(win);
      return;
    }
    this.applyBounds(win, nextX, nextY, size);
  }

  private settle(win: PetSitWindow): void {
    if (this.settled) return;
    this.settled = true;
    this.deps.onSettle?.(win);
  }

  private applyBounds(
    win: PetSitWindow,
    x: number,
    y: number,
    size: { width: number; height: number },
  ): void {
    if (win.setBounds) {
      win.setBounds({ x, y, width: size.width, height: size.height });
    } else {
      win.setPosition(x, y);
    }
  }

  private now(): number {
    return this.deps.now?.() ?? Date.now();
  }
}

function clamp(value: number, limit: number): number {
  return Math.max(-limit, Math.min(limit, value));
}
