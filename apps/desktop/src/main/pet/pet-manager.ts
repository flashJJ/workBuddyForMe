/**
 * 桌宠窗管理器（M4 伴身）：单窗生命周期 + 穿透滞回接线 + 右键菜单 +
 * 主窗↔桌宠的 IPC 表现事件转发 + 关窗语义协调。
 *
 * 设计要点（docs/plan/v1.0/06-桌宠伴身方案.md）：
 * - 桌宠存活时关闭主窗 = 隐藏主窗而非退出（prepareQuit 置位后放行真退出）；
 * - 桌宠被用户关闭后主窗重新出现，避免应用「消失」；
 * - 表现事件主进程只净化+单窗转发，不缓存；
 * - 全部 Electron API 经结构化接口注入，核心逻辑可纯单测。
 */
import { app, ipcMain, screen, type BrowserWindow, Menu } from 'electron';
import {
  normalizeAvatarModelId,
  sanitizePetEvent,
  type PetPerformanceEvent,
} from '@wbfm/shared';
import type { WindowBootInfo } from '../window';
import { PetClickThroughController } from './pet-penetration';
import { loadPetState, savePetState, type PetState } from './pet-state';
import { createPetWindow, isCursorOverPet, type CursorPoint } from './pet-window';

export interface PetWebContentsLike {
  on(channel: string, cb: (...args: unknown[]) => void): unknown;
  send(channel: string, ...args: unknown[]): void;
}

export interface SystemMenuEventLike {
  preventDefault(): void;
}

export interface PetWindowLike {
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
  isDestroyed(): boolean;
  isMinimized?(): boolean;
  isVisible?(): boolean;
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

export interface IpcEventLike {
  sender: unknown;
}

export interface IpcMainLike {
  handle(
    channel: string,
    listener: (event: IpcEventLike, ...args: unknown[]) => unknown,
  ): void;
  on(channel: string, listener: (event: IpcEventLike, ...args: unknown[]) => void): void;
}

export interface PetContextMenuActions {
  isClickThrough: boolean;
  focusMain(): void;
  toggleClickThrough(): void;
  hide(): void;
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
  showContextMenu?: (win: PetWindowLike, actions: PetContextMenuActions) => void;
  /** 测试注入：当前全局光标（DIP），默认 Electron screen.getCursorScreenPoint */
  getCursor?: () => CursorPoint;
  /** 测试注入：轮询定时器（默认 setInterval/clearInterval） */
  setInterval?: typeof setInterval;
  clearInterval?: typeof clearInterval;
}

const OPEN_CHANGED_CHANNEL = 'pet:open-changed';
const PERFORMANCE_CHANNEL = 'pet:performance';
/** 主进程悬停轮询间隔（ms）：约 60fps 足够跟手，命中计算极轻 */
const HOVER_POLL_MS = 16;
/** 系统拖拽 move 事件后暂停悬停翻转的宽限（ms），覆盖连续拖动 */
const NATIVE_DRAG_GRACE_MS = 200;
/** 默认角色（与 web/voice schema 默认值一致） */
const DEFAULT_MODEL = 'haru';

export class PetManager {
  private win: PetWindowLike | null = null;
  private controller: PetClickThroughController | null = null;
  private state: PetState;
  private quitting = false;
  /** 原位换模型进行中：closed 事件不唤主窗、不广播关闭 */
  private swapping = false;
  /** 当前桌宠展示的模型（归一后） */
  private currentModelId = DEFAULT_MODEL;
  private hoverTimer: ReturnType<typeof setInterval> | null = null;
  /** 手动拖拽：按下点与窗口原点的偏移（DIP） */
  private dragOffset: { x: number; y: number } | null = null;
  /** 拖拽手势起点（DIP）：用于区分「点击 tap」与「真拖动」 */
  private dragStart: { x: number; y: number } | null = null;

  constructor(private readonly deps: PetManagerDeps) {
    this.state = loadPetState(deps.userDataDir);
  }

  isOpen(): boolean {
    return Boolean(this.win && !this.win.isDestroyed());
  }

  /**
   * 打开桌宠；已打开时：
   * - 相同模型 → 幂等无操作；
   * - 不同模型 → 原位静默换模型（不关闭、不唤主窗、不闪烁开关广播）。
   */
  async open(modelId?: string): Promise<boolean> {
    const target = normalizeAvatarModelId(modelId);
    if (this.isOpen()) {
      if (target === this.currentModelId) return true;
      return this.swapModel(target);
    }
    const win = this.createWindow(target);
    this.attachWindow(win);
    this.currentModelId = target;
    this.broadcastOpen(true);
    return true;
  }

  /** 原位换模型：持久化当前位置 → 销毁旧窗（抑制 closed 副作用）→ 同位置建新窗 */
  private async swapModel(target: string): Promise<boolean> {
    const old = this.win;
    if (!old || old.isDestroyed()) return this.open(target);
    this.swapping = true;
    this.stopHoverPolling();
    this.controller?.dispose();
    this.controller = null;
    this.persistBounds(old); // state 即变为当前 bounds，新窗据此定位
    old.destroy();
    this.win = null;
    this.swapping = false;

    const win = this.createWindow(target);
    this.attachWindow(win);
    this.currentModelId = target;
    // 换模型不广播 open-changed（对主窗而言桌宠一直是开的）
    return true;
  }

  private createWindow(modelId: string): PetWindowLike {
    const factory: NonNullable<PetManagerDeps['createWindow']> =
      this.deps.createWindow ??
      ((boot, state, id) => createPetWindow(boot, state, id) as unknown as PetWindowLike);
    return factory(this.deps.boot, this.state, modelId);
  }

  /** 绑定穿透滞回、右键菜单、悬停轮询（新建/换模型共用） */
  private attachWindow(win: PetWindowLike): void {
    this.win = win;

    this.controller = new PetClickThroughController({
      setPenetrating: (penetrating) => {
        if (!win.isDestroyed()) win.setIgnoreMouseEvents(penetrating, { forward: penetrating });
      },
    });
    this.controller.start();

    // 右键菜单两条触发路径：
    //  - 头部 no-drag 区：渲染层 onContextMenu → pet:show-menu IPC；
    //  - 身体 drag 区（非客户区，DOM 事件被吞）：Electron 'system-context-menu' 事件，
    //    preventDefault 阻止系统标题栏菜单后弹我们的自定义菜单。
    win.on('system-context-menu', (event) => {
      event?.preventDefault();
      if (this.isOpen()) this.requestMenu();
    });
    win.webContents.on('renderer-process-crashed', () => {
      void this.close();
    });
    win.on('closed', () => this.handleClosed());
    this.startHoverPolling(win);
  }

  /**
   * 主进程轮询全局光标判定悬停（命中盒比例同 Web 端）。
   * Windows 穿透转发 mousemove 不可靠，这是唯一可信的命中来源；窗口最小化/隐藏时不翻转。
   *
   * 系统 app-region 拖拽期间窗口连续触发 'move'：此时光标可能短暂滑出命中盒，
   * 若轮询把穿透翻回去会打断系统拖拽（并闪烁）。用 move 事件刷新一个「系统拖拽
   * 宽限窗」，窗内暂停翻转；松手停止 move 后自然恢复。
   */
  private startHoverPolling(win: PetWindowLike): void {
    const getCursor = this.deps.getCursor ?? (() => screen.getCursorScreenPoint());
    let nativeMovingUntil = 0;
    win.on('move', () => {
      nativeMovingUntil = Date.now() + NATIVE_DRAG_GRACE_MS;
      this.controller?.force(false);
    });
    const tick = () => {
      if (win.isDestroyed()) return;
      if (win.isMinimized?.() || win.isVisible?.() === false) return;
      if (Date.now() < nativeMovingUntil) return;
      const hovering = isCursorOverPet(getCursor(), win.getBounds());
      this.controller?.update(hovering);
    };
    tick();
    const setter = this.deps.setInterval ?? setInterval;
    this.hoverTimer = setter(tick, HOVER_POLL_MS);
  }

  private stopHoverPolling(): void {
    if (this.hoverTimer !== null) {
      const clearer = this.deps.clearInterval ?? clearInterval;
      clearer(this.hoverTimer);
      this.hoverTimer = null;
    }
  }

  /** 用户/UI 关闭：持久化位置后关窗；'closed' 事件里回收并唤回主窗 */
  async close(): Promise<void> {
    const win = this.win;
    if (!win || win.isDestroyed()) {
      this.resetAfterClose();
      return;
    }
    this.persistBounds(win);
    win.close();
  }

  /** 桌宠命中盒悬停结果 → 滞回控制器（高频，内部状态去重） */
  reportHover(hovering: boolean): void {
    this.controller?.update(hovering);
  }

  /**
   * 手动拖拽开始：记录按下点与偏移（均为 Electron 全局 DIP 坐标）。
   * 不接收渲染端 screenX/Y（那是设备像素，系统缩放 125%/150% 下与 setPosition
   * 的 DIP 坐标系不一致，会导致窗口追光标越拖越快、视觉上变大闪烁）。
   */
  beginDrag(): void {
    const win = this.win;
    if (!win || win.isDestroyed()) return;
    const cursor = this.readCursor();
    const bounds = win.getBounds();
    this.dragOffset = { x: cursor.x - bounds.x, y: cursor.y - bounds.y };
    this.dragStart = { x: cursor.x, y: cursor.y };
    // 拖拽期间强制可交互并清掉滞回计时，防止轮询在移动中把穿透翻回来（闪烁/丢事件）
    this.controller?.force(false);
  }

  /**
   * 拖动中的心跳（渲染端 mousemove 触发）：主进程直接读全局 DIP 光标定位。
   * 不传坐标——渲染端 screenX 是设备像素，系统缩放 125%/150% 下会与窗口 DIP
   * 坐标系错位，导致窗口追光标越拖越快。
   */
  dragTo(): void {
    const win = this.win;
    if (!win || win.isDestroyed() || !this.dragOffset || !this.dragStart) return;
    const cursor = this.readCursor();
    // 3px 阈值内不移动窗口：把点击/小抖动与真拖动区分开，避免误触窗口重排
    if (
      Math.abs(cursor.x - this.dragStart.x) < 3 &&
      Math.abs(cursor.y - this.dragStart.y) < 3
    ) {
      return;
    }
    win.setPosition(
      Math.round(cursor.x - this.dragOffset.x),
      Math.round(cursor.y - this.dragOffset.y),
    );
  }

  endDrag(): void {
    const win = this.win;
    const wasDrag =
      this.dragOffset !== null &&
      this.dragStart !== null &&
      Math.abs(this.readCursor().x - this.dragStart.x) +
        Math.abs(this.readCursor().y - this.dragStart.y) >=
        3;
    this.dragOffset = null;
    this.dragStart = null;
    if (win && !win.isDestroyed() && wasDrag) this.persistBounds(win);
    // 恢复轮询判定：下一个 tick 会按当前光标实际位置重算穿透态
  }

  private readCursor(): CursorPoint {
    return (this.deps.getCursor ?? (() => screen.getCursorScreenPoint()))();
  }

  /** 渲染层右键：桌宠窗发送方校验后弹菜单（app-region 方案下此事件会被吞，故走 IPC） */
  requestMenu(): void {
    const win = this.win;
    if (!win || win.isDestroyed()) return;
    // 弹菜单瞬间确保窗口可交互（穿透态下菜单无法接收点击，且事件可能已丢失）
    this.controller?.force(false);
    this.showMenu(win);
  }

  /** 双击角色 / 关宠：唤回并聚焦主窗（最小化先还原） */
  focusMain(): void {
    const main = this.deps.getMainWindow();
    if (!main || main.isDestroyed?.()) return;
    if (main.isMinimized()) main.restore();
    main.show();
    main.focus();
  }

  /** 主窗中继的语音表现事件：净化后单窗转发；桌宠未开直接丢弃 */
  relayPerformance(raw: unknown): void {
    const win = this.win;
    if (!win || win.isDestroyed()) return;
    const event = sanitizePetEvent(raw) as PetPerformanceEvent | null;
    if (event) win.webContents.send(PERFORMANCE_CHANNEL, event);
  }

  /**
   * 主窗 close 事件拦截：桌宠存活且非应用退出时 → 隐藏主窗。
   * 返回 true 表示已拦截。
   */
  handleMainClose(event: { preventDefault(): void }): boolean {
    if (this.quitting || !this.isOpen()) return false;
    event.preventDefault();
    this.deps.getMainWindow()?.hide();
    return true;
  }

  /** 应用退出前调用：置位（后续不再唤主窗）+ 持久化 + 立即销毁桌宠 */
  prepareQuit(): void {
    this.quitting = true;
    const win = this.win;
    if (win && !win.isDestroyed()) {
      this.persistBounds(win);
      win.destroy();
    }
    this.resetAfterClose();
  }

  /** 注册 pet:* IPC（含发送方身份校验：中继仅主窗、悬停仅桌宠） */
  registerIpc(ipc: IpcMainLike): void {
    ipc.handle('pet:open', (event, modelId) => {
      if (!this.fromMain(event.sender)) return this.isOpen();
      return this.open(typeof modelId === 'string' ? modelId : undefined);
    });
    ipc.handle('pet:close', (event) => {
      if (!this.fromMain(event.sender)) return undefined;
      return this.close();
    });
    ipc.handle('pet:is-open', () => this.isOpen());
    ipc.on('pet:hover', (event, hovering) => {
      if (event.sender === this.win?.webContents) this.reportHover(Boolean(hovering));
    });
    ipc.on('pet:focus-main', (event) => {
      if (event.sender === this.win?.webContents) this.focusMain();
    });
    // 手动拖拽（替代被 app-region 吞事件的系统拖拽）：仅桌宠窗可驱动
    ipc.on('pet:drag-begin', (event) => {
      if (event.sender === this.win?.webContents) this.beginDrag();
    });
    ipc.on('pet:drag-to', (event) => {
      if (event.sender === this.win?.webContents) this.dragTo();
    });
    ipc.on('pet:drag-end', (event) => {
      if (event.sender === this.win?.webContents) this.endDrag();
    });
    // 右键菜单：渲染层显式上报（app-region drag 会吞 contextmenu，不依赖 webContents 事件）
    ipc.on('pet:show-menu', (event) => {
      if (event.sender === this.win?.webContents) this.requestMenu();
    });
    ipc.on('pet:relay', (event, raw) => {
      if (this.fromMain(event.sender)) this.relayPerformance(raw);
    });
  }

  private fromMain(sender: unknown): boolean {
    return sender === this.deps.getMainWindow()?.webContents;
  }

  private showMenu(win: PetWindowLike): void {
    const actions: PetContextMenuActions = {
      isClickThrough: this.state.clickThrough,
      focusMain: () => this.focusMain(),
      toggleClickThrough: () => this.setClickThrough(!this.state.clickThrough),
      hide: () => void this.close(),
    };
    if (this.deps.showContextMenu) {
      this.deps.showContextMenu(win, actions);
      return;
    }
    const menu = Menu.buildFromTemplate([
      { label: '回到主窗口', click: () => actions.focusMain() },
      {
        label: '鼠标穿透（点击落到下层）',
        type: 'checkbox',
        checked: actions.isClickThrough,
        click: () => actions.toggleClickThrough(),
      },
      { type: 'separator' },
      { label: '隐藏桌宠', click: () => actions.hide() },
    ]);
    // 必须显式指定所属窗口：桌宠经 showInactive 弹出、通常不是活动窗口，
    // popup({}) 无主窗口时菜单可能不显示或立即消失。
    menu.popup({ window: win as unknown as BrowserWindow });
  }

  private setClickThrough(value: boolean): void {
    this.state.clickThrough = value;
    savePetState(this.deps.userDataDir, this.state);
    // 手动切换立即生效（force 清掉滞回计时器），下一次 hover 更新照常
    this.controller?.force(value);
  }

  private handleClosed(): void {
    // 原位换模型：swapModel 自己负责销毁/重建与回收，这里不做任何事
    if (this.swapping) return;
    // 'closed' 可能由用户关窗或 prepareQuit 的 destroy 触发；仅前者唤回主窗
    const shouldFocusMain = !this.quitting;
    this.resetAfterClose();
    if (shouldFocusMain) this.focusMain();
  }

  private resetAfterClose(): void {
    this.stopHoverPolling();
    this.controller?.dispose();
    this.controller = null;
    this.win = null;
    this.broadcastOpen(false);
  }

  private persistBounds(win: PetWindowLike): void {
    const bounds = win.getBounds();
    if (Number.isFinite(bounds.x) && Number.isFinite(bounds.y)) {
      this.state = { ...this.state, x: Math.round(bounds.x), y: Math.round(bounds.y) };
      savePetState(this.deps.userDataDir, this.state);
    }
  }

  private broadcastOpen(open: boolean): void {
    const main = this.deps.getMainWindow();
    if (!main || main.isDestroyed?.()) return;
    try {
      main.webContents.send(OPEN_CHANGED_CHANNEL, open);
    } catch {
      /* 主窗正在销毁等竞态：忽略广播 */
    }
  }
}

/**
 * 应用启动时创建桌宠管理器并注册 pet:* IPC（index.ts 一行接线）。
 * 抽成独立工厂以控制 index.ts 体积（≤300 行门禁）。
 */
export function createAppPetManager(
  boot: WindowBootInfo | null,
  getMainWindow: () => BrowserWindow | null,
): PetManager {
  const manager = new PetManager({
    userDataDir: app.getPath('userData'),
    boot,
    getMainWindow,
  });
  manager.registerIpc(ipcMain);
  return manager;
}
