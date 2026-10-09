/**
 * 桌宠手动拖拽手势（v1.1 M2 从 pet-manager 抽出，逻辑零改动）。
 *
 * 坐标系只用 Electron 全局 DIP（screen.getCursorScreenPoint + setPosition）：
 * 渲染端 screenX/Y 是设备像素，系统缩放 125%/150% 下与窗口 DIP 坐标系不一致，
 * 会导致窗口追光标越拖越快、视觉上变大闪烁，故一律不接收渲染端坐标。
 *
 * 3px 手势阈值区分「点击 tap」与「真拖动」，避免误触窗口重排。
 * 纯逻辑（窗口/光标均经最小结构接口注入），不直接依赖 Electron，可纯单测。
 */

export interface PetPoint {
  x: number;
  y: number;
}

export interface PetDragWindow {
  isDestroyed(): boolean;
  getBounds(): { x: number; y: number; width: number; height: number };
  setPosition(x: number, y: number): void;
}

export interface PetDragHooks {
  getCursor: () => PetPoint;
  /** 真拖动结束时回调（manager 用于持久化窗口位置） */
  onDragEnd?: (win: PetDragWindow) => void;
  /** 拖拽开始时回调（manager 用于强制可交互，防轮询把穿透翻回来） */
  onDragStart?: () => void;
}

/** 点击/抖动与真拖动的判定阈值（DIP） */
export const DRAG_THRESHOLD_PX = 3;

export class PetDragController {
  /** 按下点与窗口原点的偏移（DIP） */
  private offset: PetPoint | null = null;
  /** 拖拽手势起点（DIP） */
  private start: PetPoint | null = null;

  constructor(private readonly hooks: PetDragHooks) {}

  isDragging(): boolean {
    return this.offset !== null;
  }

  /** 拖拽开始：记录按下点与偏移；拖拽期间强制窗口可交互 */
  begin(win: PetDragWindow | null): void {
    if (!win || win.isDestroyed()) return;
    const cursor = this.hooks.getCursor();
    const bounds = win.getBounds();
    this.offset = { x: cursor.x - bounds.x, y: cursor.y - bounds.y };
    this.start = { x: cursor.x, y: cursor.y };
    this.hooks.onDragStart?.();
  }

  /** 拖动心跳：超 3px 阈值后按全局光标定位窗口 */
  dragTo(win: PetDragWindow | null): void {
    if (!win || win.isDestroyed() || !this.offset || !this.start) return;
    const cursor = this.hooks.getCursor();
    if (
      Math.abs(cursor.x - this.start.x) < DRAG_THRESHOLD_PX &&
      Math.abs(cursor.y - this.start.y) < DRAG_THRESHOLD_PX
    ) {
      return;
    }
    win.setPosition(
      Math.round(cursor.x - this.offset.x),
      Math.round(cursor.y - this.offset.y),
    );
  }

  /** 拖拽结束：位移达阈值才视为真拖动并回调持久化；复位手势状态 */
  end(win: PetDragWindow | null): void {
    const wasDrag =
      this.offset !== null &&
      this.start !== null &&
      this.manhattanFromStart(this.hooks.getCursor()) >= DRAG_THRESHOLD_PX;
    this.offset = null;
    this.start = null;
    if (win && !win.isDestroyed() && wasDrag) this.hooks.onDragEnd?.(win);
  }

  private manhattanFromStart(cursor: PetPoint): number {
    if (!this.start) return 0;
    return Math.abs(cursor.x - this.start.x) + Math.abs(cursor.y - this.start.y);
  }
}
