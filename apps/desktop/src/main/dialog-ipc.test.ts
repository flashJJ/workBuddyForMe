import { describe, expect, it, vi } from 'vitest';
import { registerDialogIpc } from './dialog-ipc';

describe('v2.11 桌面目录选择 IPC', () => {
  it('注册单通道并回传 picker 结果', async () => {
    const handlers = new Map<string, (event: unknown) => Promise<string | null>>();
    const ipc = {
      handle: vi.fn((channel: string, listener: (event: unknown) => Promise<string | null>) => {
        handlers.set(channel, listener);
      }),
    };
    registerDialogIpc(ipc, async () => 'C:\\work');
    expect(ipc.handle).toHaveBeenCalledTimes(1);
    expect(ipc.handle).toHaveBeenCalledWith('dialog:pick-directory', expect.any(Function));
    await expect(handlers.get('dialog:pick-directory')!({})).resolves.toBe('C:\\work');
  });

  it('取消返回 null', async () => {
    const handlers = new Map<string, (event: unknown) => Promise<string | null>>();
    const ipc = {
      handle: (channel: string, listener: (event: unknown) => Promise<string | null>) => {
        handlers.set(channel, listener);
      },
    };
    registerDialogIpc(ipc, async () => null);
    await expect(handlers.get('dialog:pick-directory')!({})).resolves.toBeNull();
  });
});
