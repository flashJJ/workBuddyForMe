import { app, type BrowserWindow } from 'electron';
import { revealMainWindow } from '../window';
import {
  FULL_INTRO_MAX_MS,
  MIN_VISIBLE_MS,
  type BootFailure,
  type BootStageId,
  type BootTiming,
} from './boot-phases';
import { buildBootLabels, resolveBootLang } from './splash-labels';
import { appendBootTiming, createBootTimer, formatTimingLine } from './splash-timing';
import {
  createBootSplash,
  resolveSplashHtmlPath,
  resolveSplashPreloadPath,
  type SplashController,
} from './splash-window';

export interface CreateBootSessionOptions {
  isDev: boolean;
  userDataDir: string;
  version: string;
  locale: string;
  icon?: string;
}

export interface BootSession {
  readonly enabled: boolean;
  mark(stage: string): void;
  phase(stage: BootStageId): void;
  setIntro(intro: 'full' | 'compact'): void;
  attachMainWindow(win: BrowserWindow): void;
  fail(failure: BootFailure): Promise<void>;
  focus(): void;
  dispose(): void;
}

const TIMING: BootTiming = { minVisibleMs: MIN_VISIBLE_MS, maxIntroMs: FULL_INTRO_MAX_MS };

/** 开发态默认不显示启动画面；WBFM_BOOT_SPLASH=1 可预览 */
function shouldShowSplash(isDev: boolean): boolean {
  if (isDev) return process.env.WBFM_BOOT_SPLASH === '1';
  return process.env.WBFM_BOOT_SPLASH !== '0';
}

/** 启动画面 + 主窗交接 + 本地耗时日志；index.ts 只负责调用顺序 */
export function createBootSession(options: CreateBootSessionOptions): BootSession {
  const timer = createBootTimer();
  const enabled = shouldShowSplash(options.isDev);
  const lang = resolveBootLang(options.locale);
  let splash: SplashController | null = null;
  let mainWindow: BrowserWindow | null = null;
  let mainReady = false;
  let revealed = false;
  let intro: 'full' | 'compact' = 'compact';

  if (enabled) {
    splash = createBootSplash({
      enabled: true,
      paths: {
        html: resolveSplashHtmlPath(!options.isDev),
        preload: resolveSplashPreloadPath(),
        icon: options.icon,
      },
    });
    splash.onClosedByUser(() => {
      if (mainReady && mainWindow) mainWindow.show();
      else app.quit();
    });
  }

  const writeTiming = (): void => {
    appendBootTiming(
      options.userDataDir,
      formatTimingLine(timer.snapshot({ version: options.version, mode: intro })),
    );
  };

  return {
    enabled,
    mark(stage) {
      timer.mark(stage);
    },
    phase(stage) {
      splash?.phase(stage);
    },
    setIntro(next) {
      intro = next;
      splash?.setMode({
        intro: next,
        lang,
        version: options.version,
        labels: buildBootLabels(lang),
        timing: TIMING,
      });
    },
    attachMainWindow(win) {
      if (!enabled || !splash) return;
      mainWindow = win;
      timer.mark('main-created');
      splash.phase('main-created');
      splash.onExited(() => {
        if (revealed || win.isDestroyed()) return;
        revealed = true;
        revealMainWindow(win, options.userDataDir);
        splash?.close();
        splash = null;
        writeTiming();
      });
      win.once('ready-to-show', () => {
        mainReady = true;
        timer.mark('main-ready');
        splash?.mainReady();
      });
    },
    async fail(failure) {
      await splash?.fail(failure);
    },
    focus() {
      splash?.focus();
    },
    dispose() {
      splash?.close();
      splash = null;
    },
  };
}
