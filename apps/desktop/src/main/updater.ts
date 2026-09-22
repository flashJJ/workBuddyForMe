import { EventEmitter } from 'node:events';
import type { BrowserWindow } from 'electron';
import type { FullUpdaterStatus, UpdateChannel, UpdateStatus } from '@wbfm/shared';
import {
  bumpLastCheck,
  readUpdaterState,
  setChannel as persistChannel,
  type UpdaterState,
} from './updater-state';

export type { FullUpdaterStatus, UpdateChannel, UpdateStatus } from '@wbfm/shared';

/** autoUpdater 子集：生产用 electron-updater 单例，测试注入 EventEmitter mock */
export interface AutoUpdaterLike {
  allowPrerelease: boolean;
  autoDownload: boolean;
  checkForUpdates(): Promise<unknown>;
  downloadUpdate(): Promise<unknown>;
  quitAndInstall(isSilent?: boolean, isForceRunAfter?: boolean): void;
  on(event: string, listener: (...args: unknown[]) => void): unknown;
  removeListener?(event: string, listener: (...args: unknown[]) => void): unknown;
}

export interface CreateUpdaterOptions {
  autoUpdater: AutoUpdaterLike;
  getVersion: () => string;
  getMainWindow: () => BrowserWindow | null;
  stateFile: string;
  /** 生产态为 true；开发态/测试为 false，所有检查走 no-op */
  enabled: boolean;
}

export class Updater {
  private status: UpdateStatus = { state: 'idle' };
  private readonly opts: CreateUpdaterOptions;

  constructor(opts: CreateUpdaterOptions) {
    this.opts = opts;
    // 构造时把持久化通道偏好同步到 autoUpdater.allowPrerelease
    this.syncChannel(readUpdaterState(opts.stateFile).channel);
  }

  /** 应用通道偏好到 autoUpdater.allowPrerelease */
  private syncChannel(channel: UpdateChannel): void {
    this.opts.autoUpdater.allowPrerelease = channel === 'beta';
  }

  /** 向渲染进程转发事件（无窗口时静默丢弃，避免阻塞主进程） */
  private send(payload: UpdateStatus): void {
    this.status = payload;
    this.opts.getMainWindow()?.webContents.send('updater:event', payload);
  }

  /** 订阅 autoUpdater 事件并转发为 UpdateStatus */
  attachEvents(): void {
    const u = this.opts.autoUpdater;
    u.on('checking-for-update', () => this.send({ state: 'checking' }));
    u.on('update-available', (info: unknown) => {
      const version = (info as { version?: string } | undefined)?.version ?? '';
      bumpLastCheck(this.opts.stateFile, new Date().toISOString());
      this.send({ state: 'available', version });
    });
    u.on('update-not-available', () => {
      bumpLastCheck(this.opts.stateFile, new Date().toISOString());
      this.send({ state: 'not-available' });
    });
    u.on('download-progress', (p: unknown) => {
      const percent = (p as { percent?: number } | undefined)?.percent ?? 0;
      this.send({ state: 'downloading', percent: Math.round(percent) });
    });
    u.on('update-downloaded', (info: unknown) => {
      const version = (info as { version?: string } | undefined)?.version ?? '';
      this.send({ state: 'downloaded', version });
    });
    u.on('error', (err: unknown) => {
      const message = err instanceof Error ? err.message : String(err);
      console.error('[wbfm] updater error:', message);
      this.send({ state: 'error', message });
    });
  }

  /** 注册 IPC 处理器：渲染进程通过 invoke 调用 */
  registerIpc(ipcMainLike: IpcMainLike): void {
    ipcMainLike.handle('updater:get-status', async () => this.getFullStatus());
    ipcMainLike.handle('updater:check', async () => this.checkForUpdates());
    ipcMainLike.handle('updater:download', async () => this.downloadUpdate());
    ipcMainLike.handle('updater:install', async () => this.quitAndInstall());
    ipcMainLike.handle('updater:set-channel', async (_e, channel: unknown) => {
      this.setChannel(channel as UpdateChannel);
      return this.getFullStatus();
    });
  }

  getFullStatus(): FullUpdaterStatus {
    const state = readUpdaterState(this.opts.stateFile);
    return {
      version: this.opts.getVersion(),
      channel: state.channel,
      lastCheckAt: state.lastCheckAt,
      status: this.status,
      enabled: this.opts.enabled,
    };
  }

  /** 触发检查；开发态直接返回 not-available，不请求 GitHub */
  async checkForUpdates(): Promise<UpdateStatus> {
    if (!this.opts.enabled) {
      this.send({ state: 'not-available' });
      return this.status;
    }
    try {
      await this.opts.autoUpdater.checkForUpdates();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.send({ state: 'error', message });
    }
    return this.status;
  }

  async downloadUpdate(): Promise<UpdateStatus> {
    if (!this.opts.enabled) return this.status;
    try {
      await this.opts.autoUpdater.downloadUpdate();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.send({ state: 'error', message });
    }
    return this.status;
  }

  quitAndInstall(): void {
    if (!this.opts.enabled) return;
    this.opts.autoUpdater.quitAndInstall();
  }

  /** 切换通道：落盘 + 同步 allowPrerelease，返回新状态 */
  setChannel(channel: UpdateChannel): UpdaterState {
    const next = persistChannel(this.opts.stateFile, channel);
    this.syncChannel(next.channel);
    return next;
  }
}

export interface IpcMainLike {
  handle(channel: string, handler: (...args: unknown[]) => unknown): void;
}

/** 测试用：最小 autoUpdater mock（EventEmitter 实现 AutoUpdaterLike） */
export class MockAutoUpdater extends EventEmitter implements AutoUpdaterLike {
  allowPrerelease = false;
  autoDownload = true;
  checkForUpdates = async (): Promise<unknown> => undefined;
  downloadUpdate = async (): Promise<unknown> => undefined;
  quitAndInstall = (): void => undefined;
  override on(event: string, listener: (...args: unknown[]) => void): this {
    super.on(event, listener);
    return this;
  }
}
