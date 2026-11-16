import { dialog } from 'electron';
import type { WbfmBackgroundPickResult } from '@wbfm/shared/background';
import { copyBackground, listBackgrounds, removeBackground } from './background-store';

/**
 * v4.4 M2：背景文件 IPC（仅主窗可用）。
 * - `background:pick`：系统文件选择 → 复制到受控目录；
 * - `background:list`：列出已复制背景；
 * - `background:remove`：按 id 删除副本。
 */

export interface BackgroundIpcMainLike {
  handle(
    channel: string,
    listener: (event: { sender?: unknown }, ...args: unknown[]) => unknown,
  ): void;
}

export interface BackgroundIpcDeps {
  /** 受控目录（<dataRoot>/backgrounds） */
  dir: string;
  /** 发送方白名单：只允许主窗 */
  fromMain: (sender: unknown) => boolean;
  /** 可注入的文件选择器（测试用） */
  pickFile?: () => Promise<string | null>;
}

async function defaultPickFile(): Promise<string | null> {
  const result = await dialog.showOpenDialog({
    title: '选择背景图片或视频',
    properties: ['openFile'],
    filters: [
      { name: '图片', extensions: ['png', 'jpg', 'jpeg', 'webp'] },
      { name: '视频', extensions: ['mp4'] },
    ],
  });
  if (result.canceled || result.filePaths.length === 0) return null;
  return result.filePaths[0] ?? null;
}

export function registerBackgroundIpc(
  ipc: BackgroundIpcMainLike,
  deps: BackgroundIpcDeps,
): void {
  const picker = deps.pickFile ?? defaultPickFile;

  ipc.handle('background:pick', async (event): Promise<WbfmBackgroundPickResult> => {
    if (!deps.fromMain(event.sender)) return { canceled: true };
    let selected: string | null;
    try {
      selected = await picker();
    } catch {
      return { canceled: true };
    }
    if (!selected) return { canceled: true };
    return copyBackground(deps.dir, selected);
  });

  ipc.handle('background:list', (event) => {
    if (!deps.fromMain(event.sender)) return [];
    return listBackgrounds(deps.dir);
  });

  ipc.handle('background:remove', (event, id) => {
    if (!deps.fromMain(event.sender) || typeof id !== 'string') return false;
    return removeBackground(deps.dir, id);
  });
}
