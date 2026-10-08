/**
 * 应用启动时创建桌宠管理器并注册 pet:* IPC（index.ts 一行接线）。
 * v1.1 M2 从 pet-manager 抽出，控制 index.ts 与 manager 本身体积。
 */
import { app, ipcMain, type BrowserWindow } from 'electron';
import type { WindowBootInfo } from '../window';
import { PetManager } from './pet-manager';

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
