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
  /**
   * 位置+尺寸原子设置。真机必须用它而非 setPosition：
   * 透明置顶窗在跨 DPI 缩放的显示器上移动时，Windows/Chromium 会按物理像素
   * 取整调整窗口尺寸，只调用 setPosition 会让窗口在拖拽过程中棘轮式「越来越大」。
   */
  setBounds?(bounds: { x: number; y: number; width: number; height: number }): void;
}

export interface PetDragHooks {
  getCursor: () => PetPoint;
  /** 真拖动结束时回调（manager 用于持久化窗口位置） */
  onDragEnd?: (win: PetDragWindow) => void;
  /** 拖拽开始时回调（manager 用于强制可交互，防轮询把穿透翻回来） */
  onDragStart?: () => void;
}

/** 点击/抖动与真拖动的判定阈值（DIP）——两端统一值，避免 CSS/DIP 缩放下判定错位 */
export const DRAG_THRESHOLD_PX = 6;

export class PetDragController {
  /** 按下点与窗口原点的偏移（DIP） */
  private offset: PetPoint | null = null;
  /** 拖拽手势起点（DIP） */
  private start: PetPoint | null = null;
  /** 按下时的窗口尺寸——拖拽全程用它复位，抵消移动过程中的尺寸漂移 */
  private size: { width: number; height: number } | null = null;

  constructor(private readonly hooks: PetDragHooks) {}

  isDragging(): boolean {
    return this.offset !== null;
  }

  /** 拖拽开始：记录按下点与偏移 + 基准尺寸；拖拽期间强制窗口可交互 */
  begin(win: PetDragWindow | null): void {
    if (!win || win.isDestroyed()) return;
    const cursor = this.hooks.getCursor();
    const bounds = win.getBounds();
    this.offset = { x: cursor.x - bounds.x, y: cursor.y - bounds.y };
    this.start = { x: cursor.x, y: cursor.y };
    this.size = { width: bounds.width, height: bounds.height };
    this.hooks.onDragStart?.();
  }

  /** 拖动心跳：超阈值后按全局光标定位窗口；有 setBounds 时同时钉住尺寸 */
  dragTo(win: PetDragWindow | null): void {
    if (!win || win.isDestroyed() || !this.offset || !this.start) return;
    const cursor = this.hooks.getCursor();
    if (
      Math.abs(cursor.x - this.start.x) < DRAG_THRESHOLD_PX &&
      Math.abs(cursor.y - this.start.y) < DRAG_THRESHOLD_PX
    ) {
      return;
    }
    const x = Math.round(cursor.x - this.offset.x);
    const y = Math.round(cursor.y - this.offset.y);
    if (win.setBounds && this.size) {
      win.setBounds({ x, y, width: this.size.width, height: this.size.height });
    } else {
      win.setPosition(x, y);
    }
  }

  /** 拖拽结束：位移达阈值才视为真拖动并回调持久化；复位手势状态 */
  end(win: PetDragWindow | null): void {
    const wasDrag =
      this.offset !== null &&
      this.start !== null &&
      this.manhattanFromStart(this.hooks.getCursor()) >= DRAG_THRESHOLD_PX;
    this.offset = null;
    this.start = null;
    this.size = null;
    if (win && !win.isDestroyed() && wasDrag) this.hooks.onDragEnd?.(win);
  }

  private manhattanFromStart(cursor: PetPoint): number {
    if (!this.start) return 0;
    return Math.abs(cursor.x - this.start.x) + Math.abs(cursor.y - this.start.y);
  }
}
