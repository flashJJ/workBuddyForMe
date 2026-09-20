import { randomBytes } from 'node:crypto';
import { app, BrowserWindow, safeStorage } from 'electron';
import { DEV_SERVER_URL, resolveServerPath, resolveUserDataDir } from './config';
import { installAppMenu } from './menu';
import { startCipherServer, type CipherEndpoint } from './cipher-server';
import { startManagedServer, type ManagedServer } from './server-manager';
import { captureWindowState, createMainWindow, type WindowBootInfo } from './window';
import { saveWindowState } from './window-state';

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
