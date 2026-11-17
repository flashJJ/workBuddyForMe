import fs from 'node:fs';
import path from 'node:path';
import { BrowserWindow, ipcMain } from 'electron';
import type { BrowserWindowConstructorOptions } from 'electron';
import {
  createPhaseEvent,
  phaseForStage,
  type BootFailure,
  type BootMode,
  type BootPhaseEvent,
  type BootPhaseId,
  type BootStageId,
} from './boot-phases';

const SPLASH_WIDTH = 640;
const SPLASH_HEIGHT = 360;
const SPLASH_BG = '#0F1115';
const SPLASH_TITLE = 'WorkBuddyForMe · 启动中';
const EXIT_FALLBACK_MS = 1_500;

export interface SplashPaths {
  html: string;
  preload: string;
  icon?: string;
}

/** 打包态 extraResources/splash；开发态源码树 resources/splash（兼容 dist 与 src 两种 __dirname） */
export function resolveSplashHtmlPath(isPackaged: boolean): string {
  if (process.env.WBFM_SPLASH_HTML) return process.env.WBFM_SPLASH_HTML;
  if (isPackaged) return path.join(process.resourcesPath, 'splash', 'index.html');
  const candidates = [
    path.resolve(__dirname, '..', 'resources', 'splash', 'index.html'),
    path.resolve(__dirname, '..', '..', 'resources', 'splash', 'index.html'),
  ];
  return candidates.find((candidate) => fs.existsSync(candidate)) ?? candidates[0]!;
}

/** tsup 产物 dist/preload/splash.js */
export function resolveSplashPreloadPath(): string {
  return path.join(__dirname, 'preload', 'splash.js');
}

/** 纯函数：便于对安全开关与窗口形态做断言 */
export function buildSplashWindowOptions(paths: SplashPaths): BrowserWindowConstructorOptions {
  return {
    width: SPLASH_WIDTH,
    height: SPLASH_HEIGHT,
    useContentSize: true,
    show: false,
    frame: false,
    transparent: false,
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    alwaysOnTop: false,
    autoHideMenuBar: true,
    center: true,
    backgroundColor: SPLASH_BG,
    title: SPLASH_TITLE,
    ...(paths.icon ? { icon: paths.icon } : {}),
    webPreferences: {
      preload: paths.preload,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      spellcheck: false,
      devTools: false,
    },
  };
}

export interface SplashController {
  readonly enabled: boolean;
  setMode(mode: BootMode): void;
  phase(stage: BootStageId): void;
  mainReady(): void;
  fail(failure: BootFailure): Promise<void>;
  close(): void;
  focus(): void;
  onExited(cb: () => void): () => void;
  onSkip(cb: () => void): () => void;
  onClosedByUser(cb: () => void): void;
  onShown(cb: () => void): void;
}

export interface CreateSplashOptions {
  enabled: boolean;
  paths: SplashPaths;
  /** 测试注入 */
  windowFactory?: (options: BrowserWindowConstructorOptions) => BrowserWindow;
  now?: () => number;
}

/** 创建启动画面窗口；enabled=false 时返回纯空实现，主窗走原有自动显示 */
export function createBootSplash(options: CreateSplashOptions): SplashController {
  if (!options.enabled) return createNoopSplash();

  const now = options.now ?? (() => performance.now());
  const exitedHandlers = new Set<() => void>();
  const skipHandlers = new Set<() => void>();
  const closedHandlers = new Set<() => void>();
  const shownHandlers = new Set<() => void>();
  let mode: BootMode | null = null;
  let lastPhase: BootPhaseId | null = null;
  let lastPhaseEvent: BootPhaseEvent | null = null;
  let pageReady = false;
  let mainReady = false;
  let exited = false;
  let disposed = false;
  let fallbackTimer: NodeJS.Timeout | null = null;

  const win =
    options.windowFactory?.(buildSplashWindowOptions(options.paths)) ??
    new BrowserWindow(buildSplashWindowOptions(options.paths));

  const send = (channel: string, payload?: unknown): void => {
    if (disposed || win.isDestroyed() || !pageReady) return;
    if (payload === undefined) win.webContents.send(channel);
    else win.webContents.send(channel, payload);
  };

  const emitExited = (): void => {
    if (exited || !mainReady) return;
    exited = true;
    if (fallbackTimer) {
      clearTimeout(fallbackTimer);
      fallbackTimer = null;
    }
    for (const handler of exitedHandlers) handler();
  };

  const cleanup = (): void => {
    if (disposed) return;
    disposed = true;
    if (fallbackTimer) clearTimeout(fallbackTimer);
    fallbackTimer = null;
    ipcMain.removeListener('boot:exited', onExited);
    ipcMain.removeListener('boot:skip', onSkip);
  };

  const onExited = (event: Electron.IpcMainEvent): void => {
    if (event.sender === win.webContents) emitExited();
  };
  const onSkip = (event: Electron.IpcMainEvent): void => {
    if (event.sender !== win.webContents) return;
    for (const handler of skipHandlers) handler();
  };
  ipcMain.on('boot:exited', onExited);
  ipcMain.on('boot:skip', onSkip);

  win.once('ready-to-show', () => {
    if (disposed) return;
    win.showInactive();
    for (const handler of shownHandlers) handler();
  });
  win.webContents.once('did-finish-load', () => {
    pageReady = true;
    if (mode) send('boot:mode', mode);
    if (lastPhaseEvent) send('boot:phase', lastPhaseEvent);
  });
  win.webContents.on('will-navigate', (event) => event.preventDefault());
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.on('closed', () => {
    const byUser = !disposed;
    cleanup();
    if (byUser) for (const handler of closedHandlers) handler();
  });
  void win.loadFile(options.paths.html).catch((error) => {
    console.error('[wbfm] splash 加载失败:', error);
    cleanup();
    if (!win.isDestroyed()) win.destroy();
  });

  return {
    enabled: true,
    setMode(next) {
      mode = next;
      if (pageReady) send('boot:mode', next);
    },
    phase(stage) {
      const phase = phaseForStage(stage);
      if (phase === lastPhase) return;
      lastPhase = phase;
      lastPhaseEvent = createPhaseEvent(phase, Math.round(now()));
      send('boot:phase', lastPhaseEvent);
    },
    mainReady() {
      if (mainReady) return;
      mainReady = true;
      send('boot:done');
      const timeout = mode?.intro === 'full' ? (mode.timing.maxIntroMs + 500) : EXIT_FALLBACK_MS;
      fallbackTimer = setTimeout(emitExited, timeout);
    },
    async fail(failure) {
      send('boot:fail', failure);
      await new Promise((resolve) => setTimeout(resolve, 600));
      cleanup();
      if (!win.isDestroyed()) win.destroy();
    },
    close() {
      cleanup();
      if (!win.isDestroyed()) win.destroy();
    },
    focus() {
      if (!win.isDestroyed()) win.focus();
    },
    onExited(cb) {
      if (exited) cb();
      exitedHandlers.add(cb);
      return () => exitedHandlers.delete(cb);
    },
    onSkip(cb) {
      skipHandlers.add(cb);
      return () => skipHandlers.delete(cb);
    },
    onClosedByUser(cb) {
      closedHandlers.add(cb);
    },
    onShown(cb) {
      shownHandlers.add(cb);
    },
  };
}

function createNoopSplash(): SplashController {
  return {
    enabled: false,
    setMode() {},
    phase() {},
    mainReady() {},
    async fail() {},
    close() {},
    focus() {},
    onExited() {
      return () => {};
    },
    onSkip() {
      return () => {};
    },
    onClosedByUser() {},
    onShown() {},
  };
}
