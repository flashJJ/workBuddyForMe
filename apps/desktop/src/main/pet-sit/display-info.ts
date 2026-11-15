/**
 * 桌宠所在显示器的 DIP 信息（v3.0 P1 从 PetManager 抽出）。
 * 注入优先（测试），否则回落 Electron screen；screen 不可用时返回 null。
 */
import { screen } from 'electron';
import type { Rect } from '../pet/pet-state';

export interface DisplayInfoDeps {
  getWorkArea?: (bounds: Rect) => Rect | null;
  getDisplayBounds?: (bounds: Rect) => Rect | null;
}

export function readWorkArea(deps: DisplayInfoDeps, bounds: Rect): Rect | null {
  if (deps.getWorkArea) return deps.getWorkArea(bounds);
  try {
    return screen.getDisplayMatching(bounds).workArea;
  } catch {
    return null;
  }
}

export function readDisplayBounds(deps: DisplayInfoDeps, bounds: Rect): Rect | null {
  if (deps.getDisplayBounds) return deps.getDisplayBounds(bounds);
  try {
    return screen.getDisplayMatching(bounds).bounds;
  } catch {
    return null;
  }
}
