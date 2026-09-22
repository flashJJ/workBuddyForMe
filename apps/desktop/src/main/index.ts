import { randomBytes } from 'node:crypto';
import path from 'node:path';
import { app, BrowserWindow, globalShortcut, ipcMain, safeStorage } from 'electron';
import { autoUpdater } from 'electron-updater';
import { DEV_SERVER_URL, resolveServerPath, resolveUserDataDir } from './config';
import { installAppMenu } from './menu';
import { startCipherServer, type CipherEndpoint } from './cipher-server';
import { startManagedServer, type ManagedServer } from './server-manager';
import { captureWindowState, createMainWindow, type WindowBootInfo } from './window';
import { saveWindowState } from './window-state';
import { Updater } from './updater';

const isDev = !app.isPackaged || process.env.WBFM_DEV === '1';

// 测试隔离：userData 覆盖必须发生在单实例锁之前（锁基于 userData 路径）
const customUserData = resolveUserDataDir();
if (customUserData) {
  app.setPath('userData', customUserData);
}

let mainWindow: BrowserWindow | null = null;
let managedServer: ManagedServer | null = null;
let cipherEndpoint: CipherEndpoint | null = null;

// 单实例锁：重复启动聚焦到已有窗口
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (!mainWindow) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  });

  app.whenReady().then(start).catch((error) => {
    console.error('桌面端启动失败', error);
    app.quit();
  });

  app.on('before-quit', () => {
    if (mainWindow) saveWindowState(app.getPath('userData'), captureWindowState(mainWindow));
  });

  app.on('window-all-closed', () => {
    app.quit();
  });
}

async function start(): Promise<void> {
  console.error('[wbfm] boot: isDev=', isDev, 'serverPath=', isDev ? '(dev)' : resolveServerPath());
  installAppMenu(isDev);

  let boot: WindowBootInfo | null = null;
  if (isDev) {
    boot = null; // 开发态加载 Next dev，不托管 token
  } else {
    if (!safeStorage.isEncryptionAvailable()) {
      throw new Error('系统密钥链不可用，无法启动（safeStorage unavailable）');
    }
    try {
      cipherEndpoint = await startCipherServer(randomBytes(24).toString('hex'));
      console.error('[wbfm] cipher 桥就绪:', cipherEndpoint.url);
      managedServer = await startManagedServer({
        userDataDir: app.getPath('userData'),
        serverPath: resolveServerPath(),
        cipher: { url: cipherEndpoint.url, token: cipherEndpoint.token },
      });
      console.error('[wbfm] 托管服务就绪:', managedServer.url);
    } catch (error) {
      console.error('[wbfm] 启动失败:', error);
      throw error;
    }
    boot = { url: managedServer.url, token: managedServer.token };
  }

  await createWindow(boot);
  setupUpdater();
  setupGlobalShortcuts();
}

/**
 * 全局快捷键（M5）：Ctrl+K 唤起命令面板。
 * 窗口未聚焦时先聚焦再发事件；窗口已聚焦时仅切换开关。
 * 开发态也注册（便于体验），退出前注销避免残留。
 */
function setupGlobalShortcuts(): void {
  const registered = globalShortcut.register('CommandOrControl+K', () => {
    const win = mainWindow;
    if (!win) return;
    if (win.isMinimized()) win.restore();
    if (!win.isFocused()) win.focus();
    win.webContents.send('command-palette:open');
  });
  if (!registered) {
    console.error('[wbfm] 全局快捷键 Ctrl+K 注册失败（可能被其他应用占用）');
  }
}

/**
 * 自动更新接入（M3）：
 * - 注册 IPC + 转发 autoUpdater 事件到渲染进程
 * - 仅打包态真正请求 GitHub Releases（isDev 走 no-op，避免开发态误检）
 * - autoDownload=true：检测到新版本后后台下载，下载完成弹窗提示重启
 * - 启动后 10s 异步检查，避免与 cipher/server 启动争抢资源
 */
function setupUpdater(): void {
  autoUpdater.autoDownload = true;
  const updater = new Updater({
    autoUpdater,
    getVersion: () => app.getVersion(),
    getMainWindow: () => mainWindow,
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

async function createWindow(boot: WindowBootInfo | null = null): Promise<void> {
  const url = boot?.url ?? DEV_SERVER_URL;
  mainWindow = createMainWindow(app.getPath('userData'), url, boot);
  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  if (isDev) mainWindow.webContents.openDevTools({ mode: 'detach' });
}

// 退出时回收托管服务与密码桥
app.on('will-quit', async (event) => {
  globalShortcut.unregisterAll();
  if (!managedServer && !cipherEndpoint) return;
  event.preventDefault();
  try {
    await managedServer?.stop();
    await cipherEndpoint?.close();
  } finally {
    managedServer = null;
    cipherEndpoint = null;
    app.exit(0);
  }
});
