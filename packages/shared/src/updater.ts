/**
 * 桌面端自动更新契约（主进程 ↔ 渲染进程 IPC 载荷）。
 *
 * 主进程 updater.ts 与渲染进程 about-panel.tsx 共用此类型，
 * 避免两端字段漂移。仅类型，无运行时逻辑。
 */
export type UpdateChannel = 'stable' | 'beta';

export type UpdateStatus =
  | { state: 'idle' }
  | { state: 'checking' }
  | { state: 'available'; version: string }
  | { state: 'not-available' }
  | { state: 'downloading'; percent: number }
  | { state: 'downloaded'; version: string }
  | { state: 'error'; message: string };

export interface FullUpdaterStatus {
  /** 当前应用版本（app.getVersion） */
  version: string;
  channel: UpdateChannel;
  lastCheckAt: string | null;
  status: UpdateStatus;
  /** 打包态才真正检查 GitHub；开发态始终 false */
  enabled: boolean;
}

/**
 * preload 通过 contextBridge 暴露的更新桥。
 * 方法走 ipcRenderer.invoke；onEvent 订阅 'updater:event' 并返回取消订阅函数。
 */
export interface WbfmUpdaterBridge {
  getStatus(): Promise<FullUpdaterStatus>;
  check(): Promise<UpdateStatus>;
  download(): Promise<UpdateStatus>;
  install(): Promise<void>;
  setChannel(channel: UpdateChannel): Promise<FullUpdaterStatus>;
  onEvent(cb: (payload: UpdateStatus) => void): () => void;
}
