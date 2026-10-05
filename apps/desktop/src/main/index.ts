import { randomBytes } from 'node:crypto';
import path from 'node:path';
import { app, BrowserWindow, clipboard, globalShortcut, ipcMain, safeStorage } from 'electron';
import { autoUpdater } from 'electron-updater';
import { DEV_SERVER_URL, resolveComputerChannelFile, resolveServerPath, resolveUserDataDir } from './config';
import { installAppMenu } from './menu';
import { startCipherServer, type CipherEndpoint } from './cipher-server';
import {
  removeChannelDiscovery,
  startComputerChannel,
  writeChannelDiscovery,
  type ComputerChannel,
  type ComputerChannelHandlers,
} from './computer/control-channel';
import { captureScreenSnapshot } from './computer/screen';
import { createNutInputBackend } from './computer/input';
import { listUiaElements } from './computer/uia';
import { focusWindow, launchApp, listWindows } from './computer/windows';
import { createClickOverlay, type ClickOverlay } from './computer/overlay';
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
let computerChannel: ComputerChannel | null = null;
let computerChannelFile: string | null = null;
let clickOverlay: ClickOverlay | null = null;

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
  await setupComputerChannel();
}

/**
 * v0.7 桌面能力控制通道：dev/prod 均启动（web server 侧经发现文件定位）。
 * 启动失败仅降级（computer 工具不可用），不阻断应用启动。
 */
async function setupComputerChannel(): Promise<void> {
  try {
    const input = createNutInputBackend({
      setClipboard: (text) => clipboard.writeText(text),
    });
    clickOverlay = createClickOverlay();
    const handlers: ComputerChannelHandlers = {
      // 截图前最小化主窗口，避免把 WorkBuddy 自身截进画面干扰模型定位
      snapshot: async (args) => {
        const win = mainWindow;
        const wasVisible = win?.isVisible() ?? false;
        const wasMinimized = win?.isMinimized() ?? false;
        if (win && wasVisible && !wasMinimized) {
          win.minimize();
          await new Promise((r) => setTimeout(r, 350));
        }
        try {
          return await captureScreenSnapshot(args);
        } finally {
          if (win && wasVisible && !wasMinimized) {
            win.restore();
            win.focus();
          }
        }
      },
      mouseMove: async ({ x, y }) => (await input.moveMouse(x, y), { ok: true as const }),
      mouseClick: async ({ x, y, button, double }) => {
        await input.moveMouse(x, y);
        clickOverlay?.showClick(x, y);
        await input.click(button, double);
        return { ok: true as const };
      },
      mouseScroll: async ({ dx, dy }) => (await input.scroll(dx, dy), { ok: true as const }),
      mousePosition: () => input.getMousePosition(),
      keyboardType: async ({ text }) => (await input.typeText(text), { ok: true as const }),
      keyboardPress: async ({ keys }) => (await input.pressKeys(keys), { ok: true as const }),
      windowList: () => listWindows(),
      windowFocus: async (a) => (await focusWindow(a), { ok: true as const }),
      appLaunch: async (a) => (await launchApp(a), { ok: true as const }),
      uiaList: (a) => listUiaElements(a),
    };
    computerChannel = await startComputerChannel({ handlers });
    computerChannelFile = resolveComputerChannelFile(app.getPath('userData'), app.isPackaged);
    writeChannelDiscovery(computerChannelFile, {
      version: 1,
      url: computerChannel.url,
      token: computerChannel.token,
      pid: process.pid,
      startedAt: new Date().toISOString(),
    });
    console.error('[wbfm] 控制通道就绪:', computerChannel.url);
  } catch (error) {
    computerChannel = null;
    computerChannelFile = null;
    console.error('[wbfm] 控制通道启动失败（屏幕感知不可用）:', error);
  }
}

/**
 * 全局快捷键（M5）：Ctrl+K 唤起命令面板。
 * 窗口未聚焦时先聚焦再发事件；窗口已聚焦时仅切换开关。
 * 开发态也注册（便于体验），退出前注销避免残留。
 *
 * v0.7 M3-4c：另注册 Ctrl+Alt+Esc 急停热键，触发即调 web server 的
 * POST /api/tasks/stop-all 中断全部活跃桌面任务。
 * - 打包态：经 managedServer.url + token 走鉴权通道
 * - 开发态：直连 DEV_SERVER_URL；dev server 未启动时静默忽略
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

  const emergencyRegistered = globalShortcut.register(
    'CommandOrControl+Alt+Escape',
    () => {
      void triggerEmergencyStop().catch((error) => {
        console.error('[wbfm] 急停热键调用失败:', error);
      });
    },
  );
  if (!emergencyRegistered) {
    console.error('[wbfm] 急停热键 Ctrl+Alt+Esc 注册失败（可能被其他应用占用）');
  }
}

/**
 * 急停 HTTP 调用：POST /api/tasks/stop-all。
 * 打包态用 managedServer.url+token；开发态回落 DEV_SERVER_URL，无 token。
 * dev server 未启动时 fetch 会失败，仅记录不阻断（急停是兜底动作，无任务时也安全）。
 */
async function triggerEmergencyStop(): Promise<void> {
  const url = managedServer?.url ?? DEV_SERVER_URL;
  const headers: Record<string, string> = {};
  if (managedServer) headers['x-wbfm-token'] = managedServer.token;
  try {
    const res = await fetch(`${url}/api/tasks/stop-all`, {
      method: 'POST',
      headers,
    });
    if (!res.ok) {
      console.error(`[wbfm] 急停 stop-all 返回 ${res.status}`);
      return;
    }
    const body = (await res.json().catch(() => ({}))) as { data?: { stopped?: number } };
    const stopped = body?.data?.stopped ?? 0;
    console.error(`[wbfm] 急停完成，中断任务数=${stopped}`);
  } catch (error) {
    // 开发态 dev server 未启动时属正常情况，仅记录
    if (managedServer) console.error('[wbfm] 急停 HTTP 调用失败:', error);
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

  // 开发态默认不自动开 DevTools：独立（detach）窗口在 Windows 上会与主窗口
  // 竞争键盘焦点，偶发造成页面输入框「有光标但打不出字」（需重开窗口才恢复）。
  // 需要时用菜单「视图 → 开发者工具」（Ctrl+Shift+I），或设 WBFM_DEVTOOLS=detach
  // 恢复旧的启动自动弹出行为。
  if (isDev && process.env.WBFM_DEVTOOLS === 'detach') {
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  }
}

// 退出时回收托管服务、密码桥与控制通道（含点击指示圈窗口）
app.on('will-quit', async (event) => {
  globalShortcut.unregisterAll();
  clickOverlay?.close();
  clickOverlay = null;
  if (computerChannelFile) removeChannelDiscovery(computerChannelFile);
  if (!managedServer && !cipherEndpoint && !computerChannel) return;
  event.preventDefault();
  try {
    await computerChannel?.close();
    await managedServer?.stop();
    await cipherEndpoint?.close();
  } finally {
    managedServer = null;
    cipherEndpoint = null;
    computerChannel = null;
    computerChannelFile = null;
    app.exit(0);
  }
});
