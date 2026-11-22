import type { PetCloseReason } from '@wbfm/shared/pet';
import { OPEN_CHANGED_CHANNEL } from '../pet-constants';
import { savePetState, type PetState } from '../pet-state';
import type { MainWindowLike, PetWindowLike } from '../pet-types';

/** 记住最后展示的模型（托盘/命令面板无 modelId 时恢复用） */
export function rememberPetModel(
  userDataDir: string,
  state: PetState,
  modelId: string,
): PetState {
  const next = { ...state, modelId };
  savePetState(userDataDir, next);
  return next;
}

/** 持久化窗口位置；坐标非法时原样返回 */
export function persistPetBounds(
  userDataDir: string,
  state: PetState,
  win: Pick<PetWindowLike, 'getBounds'>,
): PetState {
  const { x, y } = win.getBounds();
  if (!Number.isFinite(x) || !Number.isFinite(y)) return state;
  const next = { ...state, x: Math.round(x), y: Math.round(y) };
  savePetState(userDataDir, next);
  return next;
}

/** 广播开关状态与关闭原因（崩溃关闭不得被前端当成用户偏好落库） */
export function broadcastPetOpen(
  main: MainWindowLike | null,
  open: boolean,
  reason: PetCloseReason | null,
): void {
  if (!main || main.isDestroyed?.()) return;
  try {
    main.webContents.send(OPEN_CHANGED_CHANNEL, { open, reason });
  } catch {
    /* 主窗正在销毁等竞态：忽略 */
  }
}

/** 双击角色/关宠：唤回并聚焦主窗（最小化先还原）；可携带站内深链 */
export function focusMainWindow(main: MainWindowLike | null, path?: string): void {
  if (!main || main.isDestroyed?.()) return;
  if (main.isMinimized()) main.restore();
  main.show();
  main.focus();
  if (path && path.startsWith('/') && !main.isDestroyed?.()) {
    main.webContents.send('app:deep-link', path);
  }
}
