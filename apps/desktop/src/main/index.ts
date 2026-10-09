/**
 * 桌面主进程入口（v1.1 T2.4 后只保留 bootstrap 序列与应用生命周期）：
 * userData/单实例锁 → whenReady：菜单 → （打包态）密码桥+托管服务 →
 * 主窗 → 桌宠 → 更新器 → 全局快捷键 → 桌面控制通道。
 * 各职责接线模块：menu / cipher-server / server-manager / window / pet-bootstrap /
 * updater-bootstrap / global-shortcuts / computer/control-bootstrap。
 */
import { randomBytes } from 'node:crypto';
import { app, BrowserWindow, globalShortcut, safeStorage } from 'electron';
import { DEV_SERVER_URL, resolveServerPath, resolveUserDataDir } from './config';
import { installAppMenu } from './menu';
import { startCipherServer, type CipherEndpoint } from './cipher-server';
import { startComputerControl, type ComputerControl } from './computer/control-bootstrap';
import { startManagedServer, type ManagedServer } from './server-manager';
import { captureWindowState, createMainWindow, type WindowBootInfo } from './window';
import { saveWindowState } from './window-state';
import { PetManager } from './pet/pet-manager';
import { createAppPetManager } from './pet/pet-bootstrap';
import { installUpdater } from './updater-bootstrap';
import { registerGlobalShortcuts } from './global-shortcuts';

const isDev = !app.isPackaged || process.env.WBFM_DEV === '1';

// 测试隔离：userData 覆盖必须发生在单实例锁之前（锁基于 userData 路径）
const customUserData = resolveUserDataDir();
if (customUserData) {
  app.setPath('userData', customUserData);
}

let mainWindow: BrowserWindow | null = null;
let managedServer: ManagedServer | null = null;
let cipherEndpoint: CipherEndpoint | null = null;
let computerControl: ComputerControl | null = null;
let petManager: PetManager | null = null;

// 单实例锁：重复启动聚焦到已有窗口
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (!mainWindow) return;
    // M4：桌宠存活时主窗可能只是被隐藏（非最小化），focus 不会自动 show
    if (!mainWindow.isVisible()) mainWindow.show();
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  });

  app.whenReady().then(start).catch((error) => {
    console.error('桌面端启动失败', error);
    app.quit();
  });

  app.on('before-quit', () => {
    // M4 伴身：退出前置位（拦截主窗关闭的 hide 语义放行）+ 立即销毁桌宠窗
    petManager?.prepareQuit();
    if (mainWindow) saveWindowState(app.getPath('userData'), captureWindowState(mainWindow));
  });

  app.on('window-all-closed', () => {
    app.quit();
  });
}

async function start(): Promise<void> {
  console.error('[wbfm] boot: isDev=', isDev, 'serverPath=', isDev ? '(dev)' : resolveServerPath());
  installAppMenu(isDev);

  const boot = await startManagedStack();

  await createWindow(boot);
  // M4 伴身：pet:* IPC 注册；主窗 close 在桌宠存活时被改为隐藏
  petManager = createAppPetManager(boot, () => mainWindow);
  installUpdater(() => mainWindow);
  registerGlobalShortcuts({
    getMainWindow: () => mainWindow,
    getManagedServer: () => managedServer,
  });
  computerControl = await startComputerControl({
    userDataDir: app.getPath('userData'),
    isPackaged: app.isPackaged,
    getMainWindow: () => mainWindow,
  });
}

/** 打包态启动密码桥与托管 Next 服务；开发态直连 Next dev，不托管 token */
async function startManagedStack(): Promise<WindowBootInfo | null> {
  if (isDev) return null;
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
      appVersion: app.getVersion(),
    });
    console.error('[wbfm] 托管服务就绪:', managedServer.url);
    return { url: managedServer.url, token: managedServer.token };
  } catch (error) {
    console.error('[wbfm] 启动失败:', error);
    throw error;
  }
}

async function createWindow(boot: WindowBootInfo | null = null): Promise<void> {
  const url = boot?.url ?? DEV_SERVER_URL;
  mainWindow = createMainWindow(app.getPath('userData'), url, boot);
  mainWindow.on('closed', () => {
    mainWindow = null;
  });
  // M4 伴身：桌宠存活时关主窗仅隐藏（双击桌宠可唤回）；prepareQuit 后正常退出
  mainWindow.on('close', (event) => {
    petManager?.handleMainClose(event);
  });

  // 开发态默认不自动开 DevTools：独立（detach）窗口在 Windows 上会与主窗口
  // 竞争键盘焦点，偶发造成页面输入框「有光标但打不出字」（需重开窗口才恢复）。
  // 需要时用菜单「视图 → 开发者工具」（Ctrl+Shift+I），或设 WBFM_DEVTOOLS=detach
  // 恢复旧的启动自动弹出行为。
  if (isDev && process.env.WBFM_DEVTOOLS === 'detach') {
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  }
}

// 退出时回收全局快捷键、控制通道（指示圈/发现文件）、托管服务与密码桥
app.on('will-quit', async (event) => {
  globalShortcut.unregisterAll();
  // 无异步收尾资源时：控制通道指示圈/发现文件同步清理后走默认退出
  if (!managedServer && !cipherEndpoint && !computerControl?.channel) {
    computerControl?.shutdownSync();
    return;
  }
  event.preventDefault();
  try {
    await computerControl?.close();
    await managedServer?.stop();
    await cipherEndpoint?.close();
  } finally {
    managedServer = null;
    cipherEndpoint = null;
    computerControl = null;
    app.exit(0);
  }
});
