import path from 'node:path';
import { BrowserWindow, shell } from 'electron';
import type { BrowserWindowConstructorOptions } from 'electron';
import { resolvePreloadPath } from './config';
import { loadWindowState, type WindowState } from './window-state';

export interface WindowBootInfo {
  /** 生产态托管服务地址；开发态传 null 加载 localhost:3000 */
  url: string;
  /** 注入 preload 的一次性令牌（仅生产态） */
  token?: string;
}

/** 纯函数：组装窗口选项，便于对安全开关做断言单测 */
export function buildWindowOptions(
  userDataDir: string,
  boot: WindowBootInfo | null,
): BrowserWindowConstructorOptions {
  const state: WindowState = loadWindowState(userDataDir);
  const additionalArguments: string[] = [];
  if (boot?.token) {
    additionalArguments.push(`--wbfm-token=${boot.token}`);
    additionalArguments.push(`--wbfm-base-url=${boot.url}`);
  }
  return {
    ...state,
    minWidth: 900,
    minHeight: 600,
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

/** 创建主窗口并加载目标地址；外链交系统浏览器 */
export function createMainWindow(userDataDir: string, url: string, boot: WindowBootInfo | null): BrowserWindow {
  const win = new BrowserWindow(buildWindowOptions(userDataDir, boot));

  win.once('ready-to-show', () => {
    if (loadWindowState(userDataDir).maximized) win.maximize();
    win.show();
  });

  win.webContents.setWindowOpenHandler(({ url: target }) => {
    if (target.startsWith('http://') || target.startsWith('https://')) {
      void shell.openExternal(target);
    }
    return { action: 'deny' };
  });

  void win.loadURL(url);
  return win;
}

/** 采集当前窗口几何用于退出前持久化 */
export function captureWindowState(win: BrowserWindow): WindowState {
  const bounds = win.getBounds();
  return { ...bounds, maximized: win.isMaximized() };
}

export const windowIconPath: string | undefined = process.resourcesPath
  ? path.join(process.resourcesPath, 'icon.ico')
  : undefined;
