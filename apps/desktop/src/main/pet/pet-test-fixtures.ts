/**
 * pet-manager 测试共享假件（v1.1 M2 从 pet-manager.test 抽出，定义零改动）：
 * 假桌宠窗（捕获 closed/move/system-context-menu 与 webContents 处理器）、
 * 假主窗、假 IPC（handle/on + invoke/emit）。
 */
import { vi } from 'vitest';
import type { IpcEventLike, IpcMainLike } from './pet-ipc';
import type { MainWindowLike, PetWindowLike } from './pet-types';

export function createFakePetWindow(): {
  win: PetWindowLike;
  wc: PetWindowLike['webContents'];
  setIgnore: ReturnType<typeof vi.fn>;
  setPosition: ReturnType<typeof vi.fn>;
} {
  const onHandlers = new Map<string, () => void>();
  const wcHandlers = new Map<string, (...args: unknown[]) => void>();
  let destroyed = false;
  const setIgnore = vi.fn();
  const setPosition = vi.fn();
  const wc: PetWindowLike['webContents'] = {
    on: vi.fn((channel: string, cb: (...args: unknown[]) => void) => {
      wcHandlers.set(channel, cb);
    }),
    send: vi.fn(),
  };
  const win: PetWindowLike = {
    webContents: wc,
    setIgnoreMouseEvents: setIgnore,
    setPosition,
    isDestroyed: vi.fn(() => destroyed),
    isMinimized: vi.fn(() => false),
    isVisible: vi.fn(() => true),
    getBounds: vi.fn(() => ({ x: 321, y: 432, width: 260, height: 340 })),
    close: vi.fn(() => {
      destroyed = true;
      onHandlers.get('closed')?.();
    }),
    destroy: vi.fn(() => {
      destroyed = true;
      onHandlers.get('closed')?.();
    }),
    on: vi.fn((event: 'closed' | 'move' | 'system-context-menu', cb: (e?: unknown) => void) => {
      onHandlers.set(event, cb as () => void);
      return win;
    }),
  };
  return { win, wc, setIgnore, setPosition };
}

export function createFakeMain(): MainWindowLike & {
  isDestroyed: ReturnType<typeof vi.fn>;
  isMinimized: ReturnType<typeof vi.fn>;
} {
  return {
    webContents: { send: vi.fn() },
    isDestroyed: vi.fn(() => false),
    isMinimized: vi.fn(() => false),
    restore: vi.fn(),
    show: vi.fn(),
    hide: vi.fn(),
    focus: vi.fn(),
  };
}

export function createFakeIpc() {
  const handles = new Map<string, (e: IpcEventLike, ...a: unknown[]) => unknown>();
  const listeners = new Map<string, (e: IpcEventLike, ...a: unknown[]) => void>();
  const ipc: IpcMainLike = {
    handle: vi.fn((ch, fn) => void handles.set(ch, fn)),
    on: vi.fn((ch, fn) => void listeners.set(ch, fn)),
  };
  return {
    ipc,
    invoke(ch: string, sender: unknown, ...args: unknown[]) {
      return handles.get(ch)!({ sender }, ...args);
    },
    emit(ch: string, sender: unknown, ...args: unknown[]) {
      listeners.get(ch)!({ sender }, ...args);
    },
  };
}
