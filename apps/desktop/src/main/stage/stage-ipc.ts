/**
 * stage:* IPC 注册（v1.9 M1）。纯注册表，身份校验在 manager：
 * - open：仅主窗可发起（防止舞台窗自开多窗）；
 * - close：主窗与舞台窗自身都可调用（Esc/关闭按钮）；
 * - capture：仅当前舞台窗；
 * - is-open：任意渲染方可查。
 */
import type { IpcEventLike, IpcMainLike } from '../pet/pet-ipc';

export interface StageIpcActions {
  isOpen(): boolean;
  open(): Promise<boolean> | boolean;
  close(): Promise<unknown> | unknown;
  capture(): Promise<{ saved: boolean; canceled?: boolean }>;
}

export interface StageIpcGuards {
  fromMain(sender: unknown): boolean;
  fromStage(sender: unknown): boolean;
}

export function registerStageIpc(ipc: IpcMainLike, actions: StageIpcActions, guards: StageIpcGuards): void {
  ipc.handle('stage:open', (event) => {
    if (!guards.fromMain(event.sender)) return actions.isOpen();
    return actions.open();
  });
  ipc.handle('stage:close', (event) => {
    if (!guards.fromMain(event.sender) && !guards.fromStage(event.sender)) return undefined;
    return actions.close();
  });
  ipc.handle('stage:is-open', () => actions.isOpen());
  ipc.handle('stage:capture', (event) => {
    if (!guards.fromStage(event.sender)) return { saved: false, canceled: true };
    return actions.capture();
  });
}

export type { IpcEventLike, IpcMainLike };
