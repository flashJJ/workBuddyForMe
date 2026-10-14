import { describe, expect, it, vi } from 'vitest';
import { registerStageIpc, type IpcMainLike } from './stage-ipc';

/** 收集 handle/on 注册的通道 */
function fakeIpc(): IpcMainLike & {
  handlers: Map<string, (event: { sender: unknown }, ...args: unknown[]) => unknown>;
} {
  const handlers = new Map<string, (event: { sender: unknown }, ...args: unknown[]) => unknown>();
  return {
    handlers,
    handle(channel, listener) {
      handlers.set(channel, listener as (event: { sender: unknown }) => unknown);
    },
    on() {
      /* stage IPC 全是 handle（invoke 模式），无 send 通道 */
    },
  };
}

describe('v1.9 stage IPC 身份校验', () => {
  const mainSender = { id: 'main' };
  const stageSender = { id: 'stage' };
  const stranger = { id: 'stranger' };

  const actions = {
    isOpen: vi.fn(() => false),
    open: vi.fn(() => true),
    close: vi.fn(() => undefined),
    capture: vi.fn(async () => ({ saved: true })),
  };

  const ipc = fakeIpc();
  registerStageIpc(
    ipc,
    actions,
    {
      fromMain: (s) => s === mainSender,
      fromStage: (s) => s === stageSender,
    },
  );

  it('stage:open：仅主窗可发起；其他发送方只查状态', () => {
    expect(ipc.handlers.get('stage:open')!({ sender: stageSender })).toBe(false);
    expect(actions.open).not.toHaveBeenCalled();
    expect(ipc.handlers.get('stage:open')!({ sender: mainSender })).toBe(true);
    expect(actions.open).toHaveBeenCalledOnce();
  });

  it('stage:close：主窗与舞台窗自身可关，陌生人被忽略', () => {
    ipc.handlers.get('stage:close')!({ sender: stranger });
    expect(actions.close).not.toHaveBeenCalled();
    ipc.handlers.get('stage:close')!({ sender: stageSender });
    ipc.handlers.get('stage:close')!({ sender: mainSender });
    expect(actions.close).toHaveBeenCalledTimes(2);
  });

  it('stage:capture：仅舞台窗可截；其他发送方拿到 canceled', async () => {
    const denied = (await ipc.handlers.get('stage:capture')!({ sender: mainSender })) as {
      saved: boolean;
      canceled?: boolean;
    };
    expect(denied.canceled).toBe(true);
    expect(actions.capture).not.toHaveBeenCalled();
    const ok = (await ipc.handlers.get('stage:capture')!({ sender: stageSender })) as { saved: boolean };
    expect(ok.saved).toBe(true);
  });

  it('stage:is-open：任意发送方可查', () => {
    actions.isOpen.mockReturnValueOnce(true);
    expect(ipc.handlers.get('stage:is-open')!({ sender: stranger })).toBe(true);
  });
});
