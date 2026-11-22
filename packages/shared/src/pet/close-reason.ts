/** 桌宠关闭原因与开关广播载荷（pet.ts 拆分，避免单文件超过 300 行） */

/** 桌宠关闭原因：user=用户主动隐藏/关闭；crash=渲染进程崩溃；quit=应用退出 */
export type PetCloseReason = 'user' | 'crash' | 'quit' | 'unknown';

/** onOpenChange 广播载荷：崩溃关闭不应被前端当成用户偏好落库 */
export interface PetOpenChange {
  open: boolean;
  /** open=true 时为 null */
  reason: PetCloseReason | null;
}

export function isPetCloseReason(value: unknown): value is PetCloseReason {
  return value === 'user' || value === 'crash' || value === 'quit' || value === 'unknown';
}
