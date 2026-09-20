import fs from 'node:fs';
import path from 'node:path';

export interface WindowState {
  x?: number;
  y?: number;
  width: number;
  height: number;
  maximized?: boolean;
}

export const DEFAULT_WINDOW_STATE: WindowState = { width: 1080, height: 720 };

/** 读取上次窗口位置/尺寸；损坏或缺省回退默认值 */
export function loadWindowState(userDataDir: string): WindowState {
  const file = stateFile(userDataDir);
  try {
    const raw = fs.readFileSync(file, 'utf8');
    const parsed = JSON.parse(raw) as Partial<WindowState>;
    return {
      ...DEFAULT_WINDOW_STATE,
      ...parsed,
      width: clampNumber(parsed.width, DEFAULT_WINDOW_STATE.width),
      height: clampNumber(parsed.height, DEFAULT_WINDOW_STATE.height),
    };
  } catch {
    return { ...DEFAULT_WINDOW_STATE };
  }
}

/** 持久化窗口状态（best-effort，失败不影响退出） */
export function saveWindowState(userDataDir: string, state: WindowState): void {
  try {
    fs.mkdirSync(userDataDir, { recursive: true });
    fs.writeFileSync(stateFile(userDataDir), JSON.stringify(state), 'utf8');
  } catch {
    /* 忽略窗口状态写入失败 */
  }
}

function stateFile(userDataDir: string): string {
  return path.join(userDataDir, 'window-state.json');
}

function clampNumber(value: number | undefined, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 320 ? value : fallback;
}
