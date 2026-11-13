/**
 * 桌宠窗管理器：单窗生命周期、原位换窗与关窗语义。
 * 拖拽/抛掷/坐立、悬停轮询、菜单、IPC 均已外迁；本类负责状态与编排。
 */
import { screen } from 'electron';
import {
  normalizeAvatarModelId,
  sanitizePetEvent,
  type PetPerformanceEvent,
  type PetQuickAction,
} from '@wbfm/shared/pet';
import { PetClickThroughController } from './pet-penetration';
import { loadPetState, savePetState, type PetState } from './pet-state';
import {
  createPetWindow,
  type CursorPoint,
} from './pet-window';
import { PetDragController, type PetDragWindow } from './pet-drag-controller';
import { PetThrowController } from './pet-throw-controller';
import { PetSitController, type PetSitWindow } from '../pet-sit/pet-sit-controller';
import { PetHoverPoller } from './pet-hover-poller';
import { PetCompanionSettingsStore, showDefaultPetContextMenu } from './pet-menu';
import { registerPetIpc, type IpcMainLike } from './pet-ipc';
import type { PetManagerDeps, PetWindowLike } from './pet-types';
import { OPEN_CHANGED_CHANNEL, PERFORMANCE_CHANNEL, DEFAULT_MODEL, MODEL_CHANGED_CHANNEL, QUICK_ACTION_CHANNEL } from './pet-constants';
import { PetModelSwitcher } from './switch/pet-model-switch';
import { createPetMotionControllers } from './motion/pet-motion';

export class PetManager {
  private win: PetWindowLike | null = null;
  private controller: PetClickThroughController | null = null;
  private state: PetState;
  private quitting = false;
  /** 当前桌宠展示的模型（归一后） */
  private currentModelId = DEFAULT_MODEL;
  private readonly hoverPoller: PetHoverPoller;
  private readonly drag: PetDragController;
  private readonly thrower: PetThrowController;
  private readonly sit: PetSitController;
  /** v3.0 P4：同窗口换模型协调（回执等待 / 超时回退 / 连续切换作废） */
  private readonly modelSwitch: PetModelSwitcher;
  /** 右键菜单勾选态：由桌宠窗上报 */
  private readonly companion = new PetCompanionSettingsStore();

  constructor(private readonly deps: PetManagerDeps) {
    this.state = loadPetState(deps.userDataDir);
    this.hoverPoller = new PetHoverPoller({
      getCursor: () => this.readCursor(),
      setInterval: deps.setInterval, clearInterval: deps.clearInterval,
      // 取消穿透（clickThrough=false）后轮询不得再翻回
      onHover: (h) => { if (this.state.clickThrough) this.controller?.update(h); },
      onForceInteractive: () => this.controller?.force(false),
    });
    this.modelSwitch = new PetModelSwitcher(deps);
    const motion = createPetMotionControllers({
      deps,
      getCursor: () => this.readCursor(),
      persist: (win) => this.persistBounds(win),
      forceInteractive: () => this.controller?.force(false),
    });
    this.drag = motion.drag;
    this.thrower = motion.thrower;
    this.sit = motion.sit;
  }

  isOpen(): boolean { return Boolean(this.win && !this.win.isDestroyed()); }

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

  /**
   * 原位换模型（v3.0 P4）：先通知渲染层热替换，保住位置/穿透/悬停状态；
   * 超时未回执（旧渲染层/崩溃）再回退为「销毁重建窗口」。
   */
  private async swapModel(target: string): Promise<boolean> {
    const old = this.win;
    if (!old || old.isDestroyed()) return this.open(target);
    const hot = await this.modelSwitch.request(
      old,
      target,
      (win, modelId) => win.webContents.send(MODEL_CHANGED_CHANNEL, modelId),
      (win, modelId) => this.recreateWindow(win, modelId),
    );
    if (hot) this.currentModelId = target; // 换模型不广播 open-changed（桌宠一直开着）
    return hot || this.isOpen();
  }

  /** 渲染层回执（IPC 已做发送方校验）：modelId 匹配当前等待才视为成功 */
  confirmModel(modelId: string): void { this.modelSwitch.confirm(modelId); }

  /** 回退路径：原位销毁重建（旧实现），窗口位置由持久化 state 沿用 */
  private recreateWindow(old: PetWindowLike, target: string): boolean {
    // 等待回执期间可能已关窗/退出：此时不能再建窗
    if (this.quitting || this.win !== old || old.isDestroyed()) return this.isOpen();
    this.hoverPoller.stop();
    this.thrower.stop();
    this.controller?.dispose();
    this.controller = null;
    this.persistBounds(old); // state 变为当前 bounds，新窗据此定位
    this.win = null; // 先摘引用：旧窗 closed 时身份不匹配，不会回收随后的新窗
    old.destroy();
    const win = this.createWindow(target);
    this.attachWindow(win);
    this.currentModelId = target;
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
    this.sit.stop();

    this.controller = new PetClickThroughController({
      setPenetrating: (penetrating) => {
        if (!win.isDestroyed()) win.setIgnoreMouseEvents(penetrating, { forward: penetrating });
      },
    });
    // 持久化「常驻可交互」偏好必须在开窗时生效（start 默认穿透）
    this.controller.start(this.state.clickThrough);

    // 右键菜单：头部走 IPC；身体 drag 区经 system-context-menu preventDefault 弹同一菜单
    win.on('system-context-menu', (event) => {
      event?.preventDefault();
      if (this.isOpen()) this.requestMenu();
    });
    // 渲染进程崩溃会留下点不动的透明残留窗（旧事件名 renderer-process-crashed 在 Electron 45 已移除）
    win.webContents.on('render-process-gone', () => void this.close());
    win.on('closed', () => this.handleClosed(win));
    this.hoverPoller.start(win);
  }

  /** 用户/UI 关闭：持久化位置后关窗；'closed' 事件里回收并唤回主窗 */
  async close(): Promise<void> {
    const win = this.win;
    if (!win || win.isDestroyed()) {
      this.resetAfterClose();
      return;
    }
    this.thrower.stop();
    this.persistBounds(win);
    win.close();
  }

  /** 桌宠命中盒悬停结果 → 滞回控制器（高频，内部状态去重；取消穿透后不再翻转） */
  reportHover(hovering: boolean): void { if (this.state.clickThrough) this.controller?.update(hovering); }

  /** 渲染层右键：发送方校验后弹菜单；弹前强制可交互（穿透态菜单收不到点击） */
  requestMenu(): void {
    const win = this.win;
    if (!win || win.isDestroyed()) return;
    this.controller?.force(false);
    this.showMenu(win);
  }

  /** 双击角色 / 关宠：唤回并聚焦主窗（最小化先还原）；可携带站内深链 */
  focusMain(path?: string): void {
    const main = this.deps.getMainWindow();
    if (!main || main.isDestroyed?.()) return;
    if (main.isMinimized()) main.restore();
    main.show();
    main.focus();
    if (path && path.startsWith('/') && !main.isDestroyed?.()) main.webContents.send('app:deep-link', path);
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
    this.thrower.stop();
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
        reportHitProxy: (raw) => this.hoverPoller.reportHitProxy(raw),
        focusMain: (path) => this.focusMain(path),
        beginDrag: () => this.drag.begin(this.win),
        dragTo: () => this.drag.dragTo(this.win),
        endDrag: () => this.drag.end(this.win),
        requestMenu: () => this.requestMenu(),
        reportCompanionSettings: (raw) => this.companion.update(raw),
        relayPerformance: (raw) => this.relayPerformance(raw),
        confirmModel: (modelId) => this.confirmModel(modelId),
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
      companion: this.companion.get(),
      focusMain: () => this.focusMain(),
      toggleClickThrough: () => this.setClickThrough(!this.state.clickThrough),
      quickAction: (action: PetQuickAction) => win.webContents.send(QUICK_ACTION_CHANNEL, action),
      hide: () => void this.close(),
    });
  }

  private setClickThrough(value: boolean): void {
    this.state.clickThrough = value;
    savePetState(this.deps.userDataDir, this.state);
    this.controller?.force(value); // 立即生效并清滞回计时
  }

  private handleClosed(win: PetWindowLike): void {
    // 身份判定替代「换模型时间窗」：旧窗迟到的 closed（异步 destroy）不得回收新窗
    if (this.win !== win) return;
    const shouldFocusMain = !this.quitting; // prepareQuit 的 destroy 不唤主窗
    this.resetAfterClose();
    if (shouldFocusMain) this.focusMain();
  }

  private resetAfterClose(): void {
    this.modelSwitch.cancel(); // 关窗后不得再走超时重建
    this.hoverPoller.stop();
    this.thrower.stop();
    this.sit.stop();
    this.controller?.dispose();
    this.controller = null;
    this.win = null;
    this.broadcastOpen(false);
  }

  private persistBounds(win: PetDragWindow | PetSitWindow): void {
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
