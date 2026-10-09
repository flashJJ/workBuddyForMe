/**
 * 桌宠管理的注入接口类型（v1.1 M2 从 pet-manager 抽出，定义零改动）。
 * Electron API 全部经这些结构化接口注入，核心逻辑可纯单测。
 */
import type { WindowBootInfo } from '../window';
import type { PetState } from './pet-state';
import type { CursorPoint } from './pet-window';
import type { PetDragWindow } from './pet-drag-controller';
import type { PetHoverWindow } from './pet-hover-poller';
import type { ShowPetContextMenu } from './pet-menu';

export interface PetWebContentsLike {
  on(channel: string, cb: (...args: unknown[]) => void): unknown;
  send(channel: string, ...args: unknown[]): void;
}

export interface SystemMenuEventLike {
  preventDefault(): void;
}

export interface PetWindowLike extends PetHoverWindow, PetDragWindow {
  webContents: PetWebContentsLike;
  setIgnoreMouseEvents(ignore: boolean, options?: { forward?: boolean }): void;
  setPosition(x: number, y: number): void;
  /**
   * - closed/move：生命周期与系统拖拽移动；
   * - system-context-menu：在非客户区（-webkit-app-region:drag 身体盒）右键时触发，
   *   preventDefault 阻止系统菜单后弹自定义菜单（drag 区收不到 DOM contextmenu）。
   */
  on(
    event: 'closed' | 'move' | 'system-context-menu',
    cb: (event?: SystemMenuEventLike) => void,
  ): unknown;
  getBounds(): { x: number; y: number; width: number; height: number };
  close(): void;
  destroy(): void;
}

export interface MainWindowLike {
  webContents: { send(channel: string, ...args: unknown[]): void };
  isDestroyed?(): boolean;
  isMinimized(): boolean;
  restore(): void;
  show(): void;
  hide(): void;
  focus(): void;
}

export interface PetManagerDeps {
  userDataDir: string;
  boot: WindowBootInfo | null;
  getMainWindow: () => MainWindowLike | null;
  /** 测试注入窗口工厂；默认真实 createPetWindow */
  createWindow?: (
    boot: WindowBootInfo | null,
    state: PetState,
    modelId: string | undefined,
  ) => PetWindowLike;
  /** 测试注入右键菜单；默认 Electron Menu 弹出 */
  showContextMenu?: ShowPetContextMenu;
  /** 测试注入：当前全局光标（DIP），默认 Electron screen.getCursorScreenPoint */
  getCursor?: () => CursorPoint;
  /** 测试注入：轮询定时器（默认 setInterval/clearInterval） */
  setInterval?: typeof setInterval;
  clearInterval?: typeof clearInterval;
}
