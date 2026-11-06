/**
 * 桌面常驻图标（v2.23）。
 *
 * 背景：桌宠存活时关闭主窗口只是隐藏，应用仍在后台运行，但任务栏上没有入口，
 * 用户无法判断「到底退没退」。托盘图标常驻后可随时：
 *  - 左键/右键打开状态菜单（显示/隐藏主窗、桌宠开关、全屏舞台、彻底退出）
 *  - 主窗因桌宠驻留而隐藏时，弹一次气泡提示「仍在后台运行」
 *
 * 图标复用窗口图标解析（打包态 resources/icon.ico，开发态 build/icon.ico），
 * 缺失时静默降级不阻断启动；菜单在每次弹出时按实时状态重建，勾选态不会过期。
 */
import { app, Menu, Tray, type MenuItemConstructorOptions } from 'electron';
import type { BrowserWindow } from 'electron';
import { resolveWindowIcon } from '../window';

export interface TrayState {
  mainVisible: boolean;
  petOpen: boolean;
  hasStage: boolean;
}

export interface TrayActions {
  showMain: () => void;
  hideMain: () => void;
  togglePet: () => void;
  openStage: () => void;
  quit: () => void;
}

/** 纯函数：托盘菜单模板，便于对中国语态/勾选/启用条件做单测 */
export function buildTrayMenuTemplate(
  state: TrayState,
  actions: TrayActions,
): MenuItemConstructorOptions[] {
  const items: MenuItemConstructorOptions[] = [
    { label: '显示主窗口', enabled: !state.mainVisible, click: () => actions.showMain() },
    { label: '隐藏主窗口', enabled: state.mainVisible, click: () => actions.hideMain() },
    { type: 'separator' },
    {
      label: '桌宠',
      type: 'checkbox',
      checked: state.petOpen,
      click: () => actions.togglePet(),
    },
  ];
  if (state.hasStage) {
    items.push({ label: '打开全屏舞台…', click: () => actions.openStage() });
  }
  items.push(
    { type: 'separator' },
    { label: '彻底退出 WorkBuddyForMe', click: () => actions.quit() },
  );
  return items;
}

/** 托盘实例的最小接口（测试注入假实例） */
export interface TrayLike {
  setToolTip(text: string): void;
  popUpContextMenu(menu?: Menu): void;
  displayBalloon?(options: { title: string; content: string; icon?: string }): void;
  on(event: 'click' | 'right-click' | 'double-click', listener: () => void): void;
  destroy(): void;
}

export interface TrayDeps {
  getMainWindow: () => BrowserWindow | null;
  isPetOpen: () => boolean;
  openPet: () => void;
  closePet: () => void;
  openStage?: () => void;
  quit: () => void;
  /** 测试注入托盘工厂；默认 Electron Tray */
  createTray?: (icon: string) => TrayLike;
}

export class AppTray {
  private tray: TrayLike | null = null;
  /** 驻留提示每会话只弹一次，避免反复打扰 */
  private balloonShown = false;
  private readonly createTray: (icon: string) => TrayLike;

  constructor(private readonly deps: TrayDeps) {
    this.createTray = deps.createTray ?? ((icon) => new Tray(icon) as unknown as TrayLike);
  }

  /** 幂等启动；图标缺失（CI 精简产物）时返回 false 并降级 */
  start(): boolean {
    if (this.tray) return true;
    const icon = resolveWindowIcon(app.isPackaged);
    if (!icon) {
      console.warn('[wbfm] 托盘图标缺失，跳过常驻图标');
      return false;
    }
    const tray = this.createTray(icon);
    this.tray = tray;
    tray.setToolTip('WorkBuddyForMe');
    // 左键也直接弹菜单：用户第一反应是点图标找「退出」
    tray.on('click', () => this.popMenu());
    tray.on('right-click', () => this.popMenu());
    this.watchMainWindow();
    return true;
  }

  destroy(): void {
    this.tray?.destroy();
    this.tray = null;
  }

  /** 主窗隐藏/显示时同步提示语，并在「因桌宠驻留而隐藏」时提示一次 */
  private watchMainWindow(): void {
    const win = this.deps.getMainWindow();
    if (!win) return;
    win.on('hide', () => {
      this.refreshTooltip();
      this.notifyResident();
    });
    win.on('show', () => this.refreshTooltip());
    this.refreshTooltip();
  }

  private popMenu(): void {
    // 每次弹出前按实时状态重建：桌宠开关、主窗可见性都在变化
    this.tray?.popUpContextMenu(Menu.buildFromTemplate(buildTrayMenuTemplate(this.readState(), this.buildActions())));
  }

  private readState(): TrayState {
    const win = this.deps.getMainWindow();
    let mainVisible = false;
    if (win && !win.isDestroyed()) mainVisible = win.isVisible();
    return {
      mainVisible,
      petOpen: this.deps.isPetOpen(),
      hasStage: Boolean(this.deps.openStage),
    };
  }

  private buildActions(): TrayActions {
    return {
      showMain: () => this.showMain(),
      hideMain: () => this.deps.getMainWindow()?.hide(),
      togglePet: () => {
        if (this.deps.isPetOpen()) this.deps.closePet();
        else this.deps.openPet();
        this.refreshTooltip();
      },
      openStage: () => this.deps.openStage?.(),
      quit: () => this.deps.quit(),
    };
  }

  private showMain(): void {
    const win = this.deps.getMainWindow();
    if (!win || win.isDestroyed()) return;
    if (win.isMinimized()) win.restore();
    win.show();
    win.focus();
  }

  private refreshTooltip(): void {
    const petOpen = this.deps.isPetOpen();
    this.tray?.setToolTip(petOpen ? 'WorkBuddyForMe · 桌宠运行中' : 'WorkBuddyForMe');
  }

  private notifyResident(): void {
    if (this.balloonShown || process.platform !== 'win32') return;
    // 只有桌宠还在跑时才是「隐藏而非退出」，其余情况关窗即退出，不必提示
    if (!this.deps.isPetOpen()) return;
    this.balloonShown = true;
    this.tray?.displayBalloon?.({
      title: 'WorkBuddyForMe 仍在后台运行',
      content: '桌宠还开着，主窗口已隐藏。点击托盘图标可唤回窗口，或选择「彻底退出」。',
      icon: resolveWindowIcon(app.isPackaged),
    });
  }
}

export function createAppTray(deps: TrayDeps): AppTray {
  return new AppTray(deps);
}
