/**
 * 桌宠窗创建（M4 伴身）。
 *
 * 窗口参数经 Spike B 真机验证（transparent/frameless/alwaysOnTop/skipTaskbar，
 * setIgnoreMouseEvents forward 往返），安全三件套与主窗一致：
 * contextIsolation + sandbox + nodeIntegration:false，复用同一 preload。
 *
 * 本文件只负责「造窗 + 定位 + 加载 /pet」；穿透滞回接线、右键菜单、
 * 语音表现转发与生命周期由 pet-manager.ts 承担。
 */
import { BrowserWindow, screen } from 'electron';
import type { BrowserWindowConstructorOptions } from 'electron';
import { normalizeAvatarModelId } from '@wbfm/shared/pet';
import { DEV_SERVER_URL, resolvePreloadPath } from '../config';
import type { WindowBootInfo } from '../window';
import { clampIntoDisplay, type PetState } from './pet-state';

/** 桌宠窗固定尺寸（DIP）：紧贴角色，尽量少挡桌面；命中盒在页面内定义 */
export const PET_WINDOW_WIDTH = 260;
export const PET_WINDOW_HEIGHT = 340;

/**
 * 命中盒（DIP 坐标，与 Web 端 pet-bridge.ts PET_HIT 同一套比例）。
 * 主进程用全局光标轮询判定悬停——Windows 穿透窗 setIgnoreMouseEvents(forward)
 * 转发的 mousemove 在指针处于下层窗口时不会可靠送达渲染层，因此命中判定必须
 * 放在主进程：screen.getCursorScreenPoint（DIP）相对窗口 bounds 直接算。
 */
export const PET_HIT_DIP = {
  leftRatio: 0.15,
  rightRatio: 0.85,
  topRatio: 0.11,
} as const;

export interface CursorPoint {
  x: number;
  y: number;
}

/** 全局光标是否落在桌宠命中列内（坐标均为 DIP） */
export function isCursorOverPet(
  cursor: CursorPoint,
  bounds: { x: number; y: number; width: number; height: number },
): boolean {
  if (bounds.width <= 0 || bounds.height <= 0) return false;
  const localX = cursor.x - bounds.x;
  const localY = cursor.y - bounds.y;
  return (
    localX >= bounds.width * PET_HIT_DIP.leftRatio &&
    localX <= bounds.width * PET_HIT_DIP.rightRatio &&
    localY >= bounds.height * PET_HIT_DIP.topRatio &&
    localY <= bounds.height
  );
}

/** 纯函数：组装桌宠窗选项，便于对透明/安全开关做断言单测 */
export function buildPetWindowOptions(x: number, y: number, boot: WindowBootInfo | null)
  : BrowserWindowConstructorOptions {
  const additionalArguments: string[] = [];
  if (boot?.token) {
    additionalArguments.push(`--wbfm-token=${boot.token}`);
    additionalArguments.push(`--wbfm-base-url=${boot.url}`);
  }
  return {
    x,
    y,
    width: PET_WINDOW_WIDTH,
    height: PET_WINDOW_HEIGHT,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    alwaysOnTop: true,
    skipTaskbar: true,
    // 双击/右键需要可聚焦；显示走 showInactive 不抢当前应用焦点
    focusable: true,
    resizable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    show: false,
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

/** 桌宠加载地址：/pet 独立透明路由；model 经 query 传入避免 pet 再发设置请求竞态 */
export function buildPetUrl(baseUrl: string, modelId: string | undefined): string {
  const model = normalizeAvatarModelId(modelId);
  return `${baseUrl}/pet?model=${encodeURIComponent(model)}`;
}

/**
 * 结合 screen 多显示器信息计算安全位置：
 * 记忆坐标落在某块屏内则贴边 clamp，否则回落主屏右下（拔副屏/改分辨率场景）。
 * 抽出为独立纯函数（screen 信息注入）便于单测。
 */
export function resolvePetPosition(
  state: PetState,
  workAreas: { x: number; y: number; width: number; height: number }[],
  primaryArea: { x: number; y: number; width: number; height: number } | null,
): { x: number; y: number } {
  return clampIntoDisplay(
    { x: state.x, y: state.y },
    { width: PET_WINDOW_WIDTH, height: PET_WINDOW_HEIGHT },
    workAreas,
    primaryArea,
  );
}

/** 创建桌宠窗：定位 → 置顶层级 → showInactive 显示（不抢焦）→ 加载 /pet */
export function createPetWindow(
  boot: WindowBootInfo | null,
  state: PetState,
  modelId: string | undefined,
): BrowserWindow {
  const baseUrl = boot?.url ?? DEV_SERVER_URL;
  const position = resolvePetPosition(
    state,
    screen.getAllDisplays().map((d) => d.workArea),
    screen.getPrimaryDisplay()?.workArea ?? null,
  );
  const win = new BrowserWindow(buildPetWindowOptions(position.x, position.y, boot));
  // 'screen-saver' 层级：高于普通置顶窗，且不触发全屏独占应用的焦点切换
  win.setAlwaysOnTop(true, 'screen-saver');
  win.once('ready-to-show', () => {
    if (!win.isDestroyed()) win.showInactive();
  });
  void win.loadURL(buildPetUrl(baseUrl, modelId));
  return win;
}
