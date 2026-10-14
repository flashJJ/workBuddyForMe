/**
 * 舞台窗管理器（v1.9 M1）：
 * - 单舞台窗生命周期（幂等开关）、几何持久化；
 * - 与桌宠互斥：开舞台时关桌宠并记住，舞台关闭后按需恢复桌宠；
 * - 无 UI 截图：capturePage 抓当前帧 → 系统保存对话框写 PNG；
 * - 队列所有方在主会话：关舞台窗不退协作/会议（窗口只是显示器）。
 */
import fs from 'node:fs';
import { BrowserWindow, dialog } from 'electron';
import type { PetManager } from '../pet/pet-manager';
import type { WindowBootInfo } from '../window';
import { createStageWindow } from './stage-window';
import { registerStageIpc } from './stage-ipc';
import type { IpcMainLike } from '../pet/pet-ipc';
import { loadStageState, saveStageState, type StageBounds } from './stage-state';

export const STAGE_OPEN_CHANGED_CHANNEL = 'stage:open-changed';

export interface StageManagerDeps {
  boot: WindowBootInfo | null;
  userDataDir: string;
  getMainWindow: () => BrowserWindow | null;
  petManager: Pick<PetManager, 'isOpen' | 'close' | 'open'>;
}

export class StageManager {
  private win: BrowserWindow | null = null;
  private quitting = false;
  /** 因开舞台而临时关掉的桌宠，舞台关闭后恢复 */
  private petWasOpen = false;

  constructor(private readonly deps: StageManagerDeps) {}

  isOpen(): boolean {
    return Boolean(this.win && !this.win.isDestroyed());
  }

  async open(): Promise<boolean> {
    if (this.isOpen()) {
      this.win?.focus();
      return true;
    }
    // 互斥：桌宠存活先记录并关闭（pet 自身会持久化几何）
    this.petWasOpen = this.deps.petManager.isOpen();
    if (this.petWasOpen) await this.deps.petManager.close();

    const state = loadStageState(this.deps.userDataDir);
    this.win = createStageWindow(this.deps.boot, state.fullscreen, state.bounds);
    this.attach(this.win);
    this.broadcast(true);
    return true;
  }

  async close(): Promise<void> {
    const win = this.win;
    if (!win || win.isDestroyed()) {
      this.handleClosed();
      return;
    }
    this.persist(win);
    win.close();
  }

  /** 无 UI 截图：UI 隐藏由渲染层在调用前完成；这里抓帧 + 保存对话框 */
  async capture(): Promise<{ saved: boolean; canceled?: boolean }> {
    const win = this.win;
    if (!win || win.isDestroyed()) return { saved: false, canceled: true };
    const image = await win.webContents.capturePage();
    const result = await dialog.showSaveDialog(win, {
      title: '保存舞台截图',
      defaultPath: `wbfm-stage-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.png`,
      filters: [{ name: 'PNG 图片', extensions: ['png'] }],
    });
    if (result.canceled || !result.filePath) return { saved: false, canceled: true };
    fs.writeFileSync(result.filePath, image.toPNG());
    return { saved: true };
  }

  prepareQuit(): void {
    this.quitting = true;
    if (this.win && !this.win.isDestroyed()) {
      this.persist(this.win);
      this.win.destroy();
    }
  }

  registerIpc(ipc: IpcMainLike): void {
    registerStageIpc(
      ipc,
      {
        isOpen: () => this.isOpen(),
        open: () => this.open(),
        close: () => this.close(),
        capture: () => this.capture(),
      },
      {
        fromMain: (sender) => sender === this.deps.getMainWindow()?.webContents,
        fromStage: (sender) => sender === this.win?.webContents,
      },
    );
  }

  private attach(win: BrowserWindow): void {
    win.webContents.on('render-process-gone', () => {
      if (!win.isDestroyed()) win.close();
    });
    win.on('close', () => this.persist(win));
    win.on('closed', () => this.handleClosed());
  }

  private persist(win: BrowserWindow): void {
    if (win.isDestroyed()) return;
    const isFull = win.isFullScreen();
    let bounds: StageBounds | null = null;
    if (!isFull) {
      const b = win.getBounds();
      bounds = { x: b.x, y: b.y, width: b.width, height: b.height };
    }
    saveStageState(this.deps.userDataDir, { fullscreen: isFull, bounds });
  }

  private handleClosed(): void {
    this.win = null;
    this.broadcast(false);
    // 互斥恢复：因舞台临时关闭的桌宠，舞台退出后原样唤回
    if (!this.quitting && this.petWasOpen) {
      this.petWasOpen = false;
      void this.deps.petManager.open();
    }
  }

  private broadcast(open: boolean): void {
    const main = this.deps.getMainWindow();
    if (main && !main.isDestroyed?.()) {
      try {
        main.webContents.send(STAGE_OPEN_CHANGED_CHANNEL, open);
      } catch {
        /* 主窗销毁竞态：忽略 */
      }
    }
  }
}
