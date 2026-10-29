import { dialog } from 'electron';

/**
 * v2.11 桌面目录选择 IPC（外部代理工作目录）：
 * - 单通道 `dialog:pick-directory`；取消返回 null；
 * - picker 可注入（测试不弹真实系统对话框）。
 */
export interface DialogIpcMainLike {
  handle(channel: string, listener: (event: unknown) => unknown): void;
}

export type DirectoryPicker = () => Promise<string | null>;

const defaultPicker: DirectoryPicker = async () => {
  const result = await dialog.showOpenDialog({ properties: ['openDirectory'] });
  if (result.canceled || result.filePaths.length === 0) return null;
  return result.filePaths[0] ?? null;
};

export function registerDialogIpc(
  ipc: DialogIpcMainLike,
  picker: DirectoryPicker = defaultPicker,
): void {
  ipc.handle('dialog:pick-directory', () => picker());
}
