/**
 * 桌宠窗管理器（v1.1 M2 拆分为协作者）：本类只保留单窗生命周期、原位换窗与关窗语义；
 * 拖拽→pet-drag-controller，悬停轮询→pet-hover-poller，菜单→pet-menu，
 * pet:* channel→pet-ipc，注入接口→pet-types，启动工厂→pet-bootstrap。
 * 桌宠存活时关主窗=隐藏而非退出；桌宠被关后主窗重现；表现事件只净化+单窗转发。
 */
import { screen } from 'electron';
import {
  normalizeAvatarModelId,
  sanitizePetEvent,
  type PetPerformanceEvent,
} from '@wbfm/shared/pet';
import { PetClickThroughController } from './pet-penetration';
import { loadPetState, savePetState, type PetState } from './pet-state';
import { createPetWindow, type CursorPoint } from './pet-window';
import { PetDragController, type PetDragWindow } from './pet-drag-controller';
import { PetHoverPoller } from './pet-hover-poller';
import { showDefaultPetContextMenu } from './pet-menu';
import { registerPetIpc, type IpcMainLike } from './pet-ipc';
import type { PetManagerDeps, PetWindowLike } from './pet-types';

const OPEN_CHANGED_CHANNEL = 'pet:open-changed';
const PERFORMANCE_CHANNEL = 'pet:performance';
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
  private readonly hoverPoller: PetHoverPoller;
  private readonly drag: PetDragController;

  constructor(private readonly deps: PetManagerDeps) {
    this.state = loadPetState(deps.userDataDir);
    this.hoverPoller = new PetHoverPoller({
      getCursor: () => this.readCursor(),
      setInterval: deps.setInterval, clearInterval: deps.clearInterval,
      onHover: (h) => this.controller?.update(h),
      onForceInteractive: () => this.controller?.force(false),
    });
    this.drag = new PetDragController({
      getCursor: () => this.readCursor(),
      onDragStart: () => this.controller?.force(false),
      onDragEnd: (win) => this.persistBounds(win),
    });
  }

  isOpen(): boolean {
    return Boolean(this.win && !this.win.isDestroyed());
  }

  /** 打开桌宠；同模型幂等，不同模型原位静默换模型（不唤主窗、不重复广播） */
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
    this.hoverPoller.stop();
    this.controller?.dispose();
    this.controller = null;
    this.persistBounds(old); // state 变为当前 bounds，新窗据此定位
    old.destroy();
    this.win = null;
    this.swapping = false;

    const win = this.createWindow(target);
    this.attachWindow(win);
    this.currentModelId = target;
    return true; // 换模型不广播 open-changed（对主窗桌宠一直开着）
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

    // 右键菜单：头部走 IPC；身体 drag 区经 system-context-menu preventDefault 弹同一菜单
    win.on('system-context-menu', (event) => {
      event?.preventDefault();
      if (this.isOpen()) this.requestMenu();
    });
    win.webContents.on('renderer-process-crashed', () => {
      void this.close();
    });
    win.on('closed', () => this.handleClosed());
    this.hoverPoller.start(win);
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

  /** 渲染层右键：发送方校验后弹菜单；弹前强制可交互（穿透态菜单收不到点击） */
  requestMenu(): void {
    const win = this.win;
    if (!win || win.isDestroyed()) return;
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

  /** 注册 pet:* IPC（身份校验：中继仅主窗、悬停/拖拽/菜单仅当前桌宠窗） */
  registerIpc(ipc: IpcMainLike): void {
    registerPetIpc(
      ipc,
      {
        isOpen: () => this.isOpen(),
        open: (modelId) => this.open(modelId),
        close: () => this.close(),
        reportHover: (h) => this.reportHover(h),
        focusMain: () => this.focusMain(),
        beginDrag: () => this.drag.begin(this.win),
        dragTo: () => this.drag.dragTo(this.win),
        endDrag: () => this.drag.end(this.win),
        requestMenu: () => this.requestMenu(),
        relayPerformance: (raw) => this.relayPerformance(raw),
      },
      { fromMain: (s) => this.fromMain(s), fromPet: (s) => s === this.win?.webContents },
    );
  }

  private fromMain(sender: unknown): boolean {
    return sender === this.deps.getMainWindow()?.webContents;
  }

  private readCursor(): CursorPoint {
    return (this.deps.getCursor ?? (() => screen.getCursorScreenPoint()))();
  }

  private showMenu(win: PetWindowLike): void {
    const show = this.deps.showContextMenu ?? showDefaultPetContextMenu;
    show(win, {
      isClickThrough: this.state.clickThrough,
      focusMain: () => this.focusMain(),
      toggleClickThrough: () => this.setClickThrough(!this.state.clickThrough),
      hide: () => void this.close(),
    });
  }

  private setClickThrough(value: boolean): void {
    this.state.clickThrough = value;
    savePetState(this.deps.userDataDir, this.state);
    this.controller?.force(value); // 立即生效并清滞回计时
  }

  private handleClosed(): void {
    if (this.swapping) return; // 原位换模型由 swapModel 自行回收
    const shouldFocusMain = !this.quitting; // prepareQuit 的 destroy 不唤主窗
    this.resetAfterClose();
    if (shouldFocusMain) this.focusMain();
  }

  private resetAfterClose(): void {
    this.hoverPoller.stop();
    this.controller?.dispose();
    this.controller = null;
    this.win = null;
    this.broadcastOpen(false);
  }

  private persistBounds(win: PetDragWindow): void {
    const { x, y } = win.getBounds();
    if (Number.isFinite(x) && Number.isFinite(y)) {
      this.state = { ...this.state, x: Math.round(x), y: Math.round(y) };
      savePetState(this.deps.userDataDir, this.state);
    }
  }

  private broadcastOpen(open: boolean): void {
    const main = this.deps.getMainWindow();
    if (!main || main.isDestroyed?.()) return;
    try {
      main.webContents.send(OPEN_CHANGED_CHANNEL, open);
    } catch {
      /* 主窗正在销毁等竞态：忽略 */
    }
  }
}
