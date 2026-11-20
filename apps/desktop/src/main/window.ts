import fs from 'node:fs';
import path from 'node:path';
import { app, BrowserWindow, screen, shell } from 'electron';
import type { BrowserWindowConstructorOptions } from 'electron';
import { resolvePreloadPath } from './config';
import { loadWithDevRetry } from './wait-for-server';
import {
  ensureVisibleWindowState,
  loadWindowState,
  MIN_WINDOW_HEIGHT,
  MIN_WINDOW_WIDTH,
  type DisplayWorkArea,
  type WindowState,
} from './window-state';

export interface WindowBootInfo {
  /** 生产态托管服务地址；开发态传 null 加载本机 dev server（默认 42337） */
  url: string;
  /** 注入 preload 的一次性令牌（仅生产态） */
  token?: string;
}

/** 纯函数：组装窗口选项，便于对安全开关做断言单测 */
export function buildWindowOptions(
  userDataDir: string,
  boot: WindowBootInfo | null,
  displays: readonly DisplayWorkArea[] = [],
): BrowserWindowConstructorOptions {
  // 扩展屏被拔掉/分辨率变化时，历史坐标可能完全在可视区外 → 丢弃坐标让系统居中
  const state: WindowState = ensureVisibleWindowState(loadWindowState(userDataDir), displays);
  const additionalArguments: string[] = [];
  if (boot?.token) {
    additionalArguments.push(`--wbfm-token=${boot.token}`);
    additionalArguments.push(`--wbfm-base-url=${boot.url}`);
  }
  return {
    ...state,
    minWidth: MIN_WINDOW_WIDTH,
    minHeight: MIN_WINDOW_HEIGHT,
    show: false,
    backgroundColor: '#0f1115',
    autoHideMenuBar: true,
    webPreferences: {
      preload: resolvePreloadPath(),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      spellcheck: false,
      additionalArguments,
    },
  };
}

/**
 * 窗口图标解析：
 * - 打包态：extraResources 收 build/icon.ico → resources/icon.ico
 * - 开发态：源码树 apps/desktop/build/icon.ico
 * - 文件缺失（如 CI 精简产物）时返回 undefined，回落 Electron 默认图标，不阻断启动
 *
 * 注意 __dirname 在不同运行方式下不同：tsup 产物是 dist/index.js（'..' 即 apps/desktop），
 * 直接跑源码时是 src/main（'..' 只是 src）。两个候选都试，避免开发态图标静默丢失。
 */
export function resolveWindowIcon(isPackaged: boolean): string | undefined {
  const candidates = isPackaged
    ? [path.join(process.resourcesPath, 'icon.ico')]
    : [
        path.resolve(__dirname, '..', 'build', 'icon.ico'),
        path.resolve(__dirname, '..', '..', 'build', 'icon.ico'),
      ];
  return candidates.find((candidate) => fs.existsSync(candidate));
}

export interface CreateMainWindowOptions {
  /** v4.5：启动画面存在时由主进程协调 show，避免抢在 splash 前面 */
  deferShow?: boolean;
}

/** 创建主窗口并加载目标地址；外链交系统浏览器 */
export function createMainWindow(
  userDataDir: string,
  url: string,
  boot: WindowBootInfo | null,
  options: CreateMainWindowOptions = {},
): BrowserWindow {
  const win = new BrowserWindow({
    ...buildWindowOptions(
      userDataDir,
      boot,
      screen.getAllDisplays().map((display) => display.workArea),
    ),
    icon: resolveWindowIcon(app.isPackaged),
  });

  win.once('ready-to-show', () => {
    if (!options.deferShow) revealMainWindow(win, userDataDir);
  });

  win.webContents.setWindowOpenHandler(({ url: target }) => {
    if (target.startsWith('http://') || target.startsWith('https://')) {
      void shell.openExternal(target);
    }
    return { action: 'deny' };
  });

  // dev 下 dev server 可能尚未就绪/正在重启：失败后自动重载，避免停在错误页
  if (app.isPackaged) void win.loadURL(url);
  else loadWithDevRetry(win, url);
  return win;
}

/** 按持久化状态最大化并显示；启动画面存在时由 boot-session 在主窗就绪后调用 */
export function revealMainWindow(win: BrowserWindow, userDataDir: string): void {
  if (win.isDestroyed()) return;
  if (loadWindowState(userDataDir).maximized) win.maximize();
  win.show();
}

/** 采集当前窗口几何用于退出前持久化 */
export function captureWindowState(win: BrowserWindow): WindowState {
  const bounds = win.getBounds();
  return { ...bounds, maximized: win.isMaximized() };
}
