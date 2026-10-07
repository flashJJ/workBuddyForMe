/**
 * 桌宠窗偏好持久化（M4 伴身）。
 *
 * 复用主窗 window-state 的模式：userData 下独立 `pet-state.json`，
 * 损坏/缺省回落默认值，写入 best-effort。只持久化位置与穿透偏好；
 * 窗口尺寸固定（PET_WINDOW_* 在 pet-window.ts），不允许用户缩放。
 */
import fs from 'node:fs';
import path from 'node:path';

export interface PetState {
  x?: number;
  y?: number;
  /** 持久化的穿透偏好（默认 true：仅角色本体可交互）；悬停滞回的运行期翻转由控制器另管 */
  clickThrough: boolean;
}

export const DEFAULT_PET_STATE: PetState = { clickThrough: true };

/** 贴边留白：默认定位与 clamp 时距离工作区边缘的最小 DIP */
export const PET_EDGE_MARGIN = 8;
/** 首次出现时距屏幕右下的留白 */
export const PET_DEFAULT_MARGIN = 24;

export interface Size {
  width: number;
  height: number;
}
export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

function stateFile(userDataDir: string): string {
  return path.join(userDataDir, 'pet-state.json');
}

/** 读取桌宠偏好；文件损坏/字段非法时回落默认（与 window-state 同一容错策略） */
export function loadPetState(userDataDir: string): PetState {
  try {
    const parsed = JSON.parse(fs.readFileSync(stateFile(userDataDir), 'utf8')) as Partial<PetState>;
    return {
      x: finiteInt(parsed.x),
      y: finiteInt(parsed.y),
      clickThrough: typeof parsed.clickThrough === 'boolean' ? parsed.clickThrough : true,
    };
  } catch {
    return { ...DEFAULT_PET_STATE };
  }
}

/** 持久化桌宠偏好（best-effort，失败不影响退出/关窗） */
export function savePetState(userDataDir: string, state: PetState): void {
  try {
    fs.mkdirSync(userDataDir, { recursive: true });
    fs.writeFileSync(stateFile(userDataDir), JSON.stringify(state), 'utf8');
  } catch {
    /* 忽略桌宠状态写入失败 */
  }
}

/**
 * 把期望位置约束到某个显示器的工作区内。
 * - 点落在某块屏幕内：clamp 到该屏工作区（留 PET_EDGE_MARGIN），防止标题栏/任务栏遮挡；
 * - 点不在任何屏幕内（副屏拔走/分辨率变更）：回落到主屏右下默认位；
 * - 无任何屏幕信息：原样返回（调用方自行兜底）。
 * 纯函数，screen API 由调用方注入，便于单测覆盖多屏/负坐标。
 */
export function clampIntoDisplay(
  point: { x?: number; y?: number },
  size: Size,
  workAreas: Rect[],
  fallback: Rect | null,
): { x: number; y: number } {
  const px = point.x;
  const py = point.y;
  const hasPoint = typeof px === 'number' && typeof py === 'number';
  const containing = hasPoint
    ? workAreas.find((a) => px! >= a.x && py! >= a.y && px! < a.x + a.width && py! < a.y + a.height)
    : undefined;
  // 注意：find 未命中返回 undefined，但 hasPoint=false 时 containing 也是 undefined；
  // 不能用 `??` 配合布尔值，这里统一显式判空
  const area = containing ?? fallback;
  if (!area) return { x: px ?? 0, y: py ?? 0 };
  if (!containing) return defaultPetPosition(area, size);
  return {
    x: clampInt(px!, area.x + PET_EDGE_MARGIN, area.x + area.width - size.width - PET_EDGE_MARGIN),
    y: clampInt(py!, area.y + PET_EDGE_MARGIN, area.y + area.height - size.height - PET_EDGE_MARGIN),
  };
}

/** 工作区右下角留白定位（首次出现 / 越界回落） */
export function defaultPetPosition(area: Rect, size: Size, margin = PET_DEFAULT_MARGIN): { x: number; y: number } {
  return {
    x: area.x + area.width - size.width - margin,
    y: area.y + area.height - size.height - margin,
  };
}

function finiteInt(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? Math.round(value) : undefined;
}

/** min > max（屏幕比窗口小）时锚到左上边界，避免反逻辑区间 */
function clampInt(value: number, min: number, max: number): number {
  if (min > max) return min;
  return Math.min(Math.max(value, min), max);
}
