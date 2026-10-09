/**
 * 桌宠悬停轮询（v1.1 M2 从 pet-manager 抽出，逻辑零改动）。
 *
 * Windows 穿透转发 mousemove 不可靠，主进程轮询全局光标是唯一可信的命中来源；
 * 窗口最小化/隐藏时不翻转。系统 app-region 拖拽期间窗口连续触发 'move'，
 * 光标可能短暂滑出命中盒——用「系统拖拽宽限窗」暂停翻转防打断，松手自然恢复。
 *
 * 定时器/光标/窗口均注入，纯逻辑可单测。
 */
import { isCursorOverPet, type CursorPoint } from './pet-window';

export interface PetHoverWindow {
  on(event: 'move', cb: () => void): unknown;
  isDestroyed(): boolean;
  isMinimized?(): boolean;
  isVisible?(): boolean;
  getBounds(): { x: number; y: number; width: number; height: number };
}

export interface PetHoverPollerDeps {
  /** 当前全局光标（DIP）；manager 注入 screen.getCursorScreenPoint 的可测试版本 */
  getCursor: () => CursorPoint;
  setInterval?: typeof setInterval;
  clearInterval?: typeof clearInterval;
  /** 悬停命中结果 → 滞回控制器（高频，内部状态去重） */
  onHover: (hovering: boolean) => void;
  /** 系统拖拽 move / 拖拽开始：强制可交互并清滞回计时 */
  onForceInteractive: () => void;
}

/** 约 60fps，命中计算极轻 */
export const HOVER_POLL_MS = 16;
/** 系统拖拽 move 事件后暂停悬停翻转的宽限（ms），覆盖连续拖动 */
export const NATIVE_DRAG_GRACE_MS = 200;

export class PetHoverPoller {
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(private readonly deps: PetHoverPollerDeps) {}

  /** 绑定 move 宽限窗并启动轮询（新建/换模型后调用一次） */
  start(win: PetHoverWindow): void {
    let nativeMovingUntil = 0;
    win.on('move', () => {
      nativeMovingUntil = Date.now() + NATIVE_DRAG_GRACE_MS;
      this.deps.onForceInteractive();
    });
    const tick = () => {
      if (win.isDestroyed()) return;
      if (win.isMinimized?.() || win.isVisible?.() === false) return;
      if (Date.now() < nativeMovingUntil) return;
      this.deps.onHover(isCursorOverPet(this.deps.getCursor(), win.getBounds()));
    };
    tick();
    const setter = this.deps.setInterval ?? setInterval;
    this.timer = setter(tick, HOVER_POLL_MS);
  }

  stop(): void {
    if (this.timer === null) return;
    const clearer = this.deps.clearInterval ?? clearInterval;
    clearer(this.timer);
    this.timer = null;
  }
}
