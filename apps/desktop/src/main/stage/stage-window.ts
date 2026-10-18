/**
 * 舞台窗创建（v1.9 M1）。
 * 与桌宠/主窗同一安全三件套（contextIsolation + sandbox + nodeIntegration:false，
 * 复用同一 preload 注入托管令牌）；全屏 BrowserWindow 加载 /stage 独立路由。
 */
import { BrowserWindow, screen } from 'electron';
import type { BrowserWindowConstructorOptions } from 'electron';
import { DEV_SERVER_URL, resolvePreloadPath } from '../config';
import type { WindowBootInfo } from '../window';
import type { StageBounds } from './stage-state';

/** 窗口化最小/默认尺寸（DIP） */
export const STAGE_DEFAULT_WIDTH = 1280;
export const STAGE_DEFAULT_HEIGHT = 800;

/** 纯函数：组装舞台窗选项 */
export function buildStageWindowOptions(
  boot: WindowBootInfo | null,
  fullscreen: boolean,
  bounds: StageBounds | null,
): BrowserWindowConstructorOptions {
  const primary = screen.getPrimaryDisplay();
  const workArea = primary.workArea;
  const width = bounds?.width ?? Math.min(STAGE_DEFAULT_WIDTH, workArea.width);
  const height = bounds?.height ?? Math.min(STAGE_DEFAULT_HEIGHT, workArea.height);
  const x = bounds?.x ?? Math.round(workArea.x + (workArea.width - width) / 2);
  const y = bounds?.y ?? Math.round(workArea.y + (workArea.height - height) / 2);

  const additionalArguments: string[] = [];
  if (boot?.token) {
    additionalArguments.push(`--wbfm-token=${boot.token}`);
    additionalArguments.push(`--wbfm-base-url=${boot.url}`);
  }

  return {
    x,
    y,
    width,
    height,
    minWidth: 960,
    minHeight: 640,
    show: false,
    fullscreen,
    backgroundColor: '#000000',
    autoHideMenuBar: true,
    title: 'WorkBuddyForMe Stage',
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

/** 舞台路由：runId/meetingId 非空时直达对应只读现场（v1.9 M2/M3） */
export function buildStageUrl(
  baseUrl: string,
  target?: { runId?: string; meetingId?: string },
): string {
  const root = `${baseUrl}/stage`;
  if (target?.meetingId) return `${root}?meeting=${encodeURIComponent(target.meetingId)}`;
  if (target?.runId) return `${root}?run=${encodeURIComponent(target.runId)}`;
  return root;
}

/** 创建舞台窗并加载 /stage（可带 run/meeting 直达现场） */
export function createStageWindow(
  boot: WindowBootInfo | null,
  fullscreen: boolean,
  bounds: StageBounds | null,
  target?: { runId?: string; meetingId?: string },
): BrowserWindow {
  const baseUrl = boot?.url ?? DEV_SERVER_URL;
  const win = new BrowserWindow(buildStageWindowOptions(boot, fullscreen, bounds));
  win.once('ready-to-show', () => {
    if (!win.isDestroyed()) win.show();
  });
  void win.loadURL(buildStageUrl(baseUrl, target));
  return win;
}
