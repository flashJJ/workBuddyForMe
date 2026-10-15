/**
 * 舞台窗几何持久化（v1.9 M1），模式同 pet-state/window-state：
 * userData 下 stage-state.json，损坏回落默认（默认全屏），best-effort 写入。
 * 只记窗口化时的 bounds 与「是否全屏退出」，重开默认进全屏。
 */
import fs from 'node:fs';
import path from 'node:path';

export interface StageBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface StageState {
  /** 上次是否以全屏态运行（默认 true：舞台默认全屏） */
  fullscreen: boolean;
  /** 窗口化 bounds（全屏态为 null） */
  bounds: StageBounds | null;
}

export const DEFAULT_STAGE_STATE: StageState = { fullscreen: true, bounds: null };

function stateFile(userDataDir: string): string {
  return path.join(userDataDir, 'stage-state.json');
}

function asBounds(value: unknown): StageBounds | null {
  if (typeof value !== 'object' || value === null) return null;
  const r = value as Record<string, unknown>;
  const nums = [r.x, r.y, r.width, r.height];
  if (!nums.every((n) => typeof n === 'number' && Number.isFinite(n))) return null;
  if ((r.width as number) < 800 || (r.height as number) < 600) return null;
  return { x: r.x as number, y: r.y as number, width: r.width as number, height: r.height as number };
}

export function loadStageState(userDataDir: string): StageState {
  try {
    const parsed = JSON.parse(fs.readFileSync(stateFile(userDataDir), 'utf8')) as Partial<StageState>;
    return {
      fullscreen: typeof parsed.fullscreen === 'boolean' ? parsed.fullscreen : true,
      bounds: asBounds(parsed.bounds),
    };
  } catch {
    return { ...DEFAULT_STAGE_STATE };
  }
}

export function saveStageState(userDataDir: string, state: StageState): void {
  try {
    fs.mkdirSync(userDataDir, { recursive: true });
    fs.writeFileSync(stateFile(userDataDir), JSON.stringify(state), 'utf8');
  } catch {
    /* 忽略舞台状态写入失败 */
  }
}
