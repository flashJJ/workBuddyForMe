import fs from 'node:fs';
import path from 'node:path';

export interface WindowState {
  x?: number;
  y?: number;
  width: number;
  height: number;
  maximized?: boolean;
}

/**
 * 主窗最小宽度：侧栏 224 + 会话栏 240 + 头像栏 256，对话区至少保留约 480。
 * 低于该宽度时聊天头部与输入区会互相挤压。
 */
export const MIN_WINDOW_WIDTH = 1200;
/** 主窗最小高度：头部与输入区之外，消息区至少保留约 550。 */
export const MIN_WINDOW_HEIGHT = 720;

export const DEFAULT_WINDOW_STATE: WindowState = { width: 1280, height: 800 };

/** 读取上次窗口位置/尺寸；损坏或缺省回退默认值，过小尺寸抬到最小值 */
export function loadWindowState(userDataDir: string): WindowState {
  const file = stateFile(userDataDir);
  try {
    const raw = fs.readFileSync(file, 'utf8');
    const parsed = JSON.parse(raw) as Partial<WindowState>;
    return {
      ...DEFAULT_WINDOW_STATE,
      ...parsed,
      width: clampDimension(parsed.width, DEFAULT_WINDOW_STATE.width, MIN_WINDOW_WIDTH),
      height: clampDimension(parsed.height, DEFAULT_WINDOW_STATE.height, MIN_WINDOW_HEIGHT),
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

function clampDimension(value: number | undefined, fallback: number, min: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  return Math.max(value, min);
}
