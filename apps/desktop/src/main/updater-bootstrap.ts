/**
 * 自动更新接线（v1.1 T2.4 从 main/index.ts 抽出，逻辑零改动；Updater 类仍在 updater.ts）。
 */
import path from 'node:path';
import { app, ipcMain, type BrowserWindow } from 'electron';
import { autoUpdater } from 'electron-updater';
import { Updater } from './updater';

/**
 * 自动更新接入（M3）：
 * - 注册 IPC + 转发 autoUpdater 事件到渲染进程
 * - 仅打包态真正请求 GitHub Releases（isDev 走 no-op，避免开发态误检）
 * - autoDownload=true：检测到新版本后后台下载，下载完成弹窗提示重启
 * - 启动后 10s 异步检查，避免与 cipher/server 启动争抢资源
 */
export function installUpdater(getMainWindow: () => BrowserWindow | null): void {
  autoUpdater.autoDownload = true;
  const updater = new Updater({
    autoUpdater,
    getVersion: () => app.getVersion(),
    getMainWindow,
    stateFile: path.join(app.getPath('userData'), 'updater-state.json'),
    enabled: app.isPackaged,
  });
  updater.registerIpc(ipcMain);
  updater.attachEvents();
  if (app.isPackaged) {
    setTimeout(() => {
      void updater.checkForUpdates().catch((error) => {
        console.error('[wbfm] 启动检查更新失败:', error);
      });
    }, 10_000);
  }
}
