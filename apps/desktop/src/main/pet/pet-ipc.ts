/**
 * pet:* IPC 注册（v1.1 M2 从 pet-manager 抽出，channel→动作映射零改动）。
 *
 * 纯注册表：channel 名与参数形状集中在此；发送方身份校验（中继仅主窗、
 * 悬停/拖拽/菜单仅桌宠）仍由 manager 的 fromMain/当前 webContents 承担，
 * 本模块不持有窗口引用。
 */

export interface IpcEventLike {
  sender: unknown;
}

export interface IpcMainLike {
  handle(
    channel: string,
    listener: (event: IpcEventLike, ...args: unknown[]) => unknown,
  ): void;
  on(channel: string, listener: (event: IpcEventLike, ...args: unknown[]) => void): void;
}

/** manager 暴露给 IPC 的动作面（身份校验在各 guard 内） */
export interface PetIpcActions {
  isOpen(): boolean;
  open(modelId?: string): Promise<boolean> | boolean;
  close(): Promise<unknown> | unknown;
  reportHover(hovering: boolean): void;
  focusMain(): void;
  beginDrag(): void;
  dragTo(): void;
  endDrag(): void;
  requestMenu(): void;
  relayPerformance(raw: unknown): void;
}

export interface PetIpcGuards {
  /** 发送方是否为主窗 webContents */
  fromMain(sender: unknown): boolean;
  /** 发送方是否为当前桌宠窗 webContents */
  fromPet(sender: unknown): boolean;
}

/** 注册全部 pet:* IPC；返回 void（与原 manager.registerIpc 一致） */
export function registerPetIpc(
  ipc: IpcMainLike,
  actions: PetIpcActions,
  guards: PetIpcGuards,
): void {
  ipc.handle('pet:open', (event, modelId) => {
    if (!guards.fromMain(event.sender)) return actions.isOpen();
    return actions.open(typeof modelId === 'string' ? modelId : undefined);
  });
  ipc.handle('pet:close', (event) => {
    if (!guards.fromMain(event.sender)) return undefined;
    return actions.close();
  });
  ipc.handle('pet:is-open', () => actions.isOpen());
  ipc.on('pet:hover', (event, hovering) => {
    if (guards.fromPet(event.sender)) actions.reportHover(Boolean(hovering));
  });
  ipc.on('pet:focus-main', (event) => {
    if (guards.fromPet(event.sender)) actions.focusMain();
  });
  // 手动拖拽（替代被 app-region 吞事件的系统拖拽）：仅桌宠窗可驱动
  ipc.on('pet:drag-begin', (event) => {
    if (guards.fromPet(event.sender)) actions.beginDrag();
  });
  ipc.on('pet:drag-to', (event) => {
    if (guards.fromPet(event.sender)) actions.dragTo();
  });
  ipc.on('pet:drag-end', (event) => {
    if (guards.fromPet(event.sender)) actions.endDrag();
  });
  // 右键菜单：渲染层显式上报（app-region drag 会吞 contextmenu）
  ipc.on('pet:show-menu', (event) => {
    if (guards.fromPet(event.sender)) actions.requestMenu();
  });
  ipc.on('pet:relay', (event, raw) => {
    if (guards.fromMain(event.sender)) actions.relayPerformance(raw);
  });
}
