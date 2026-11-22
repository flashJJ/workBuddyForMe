import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('electron', () => ({
  Menu: { buildFromTemplate: vi.fn(), popup: vi.fn() },
}));

import { PetManager } from '../pet-manager';
import { createFakeMain, createFakePetWindow } from '../pet-test-fixtures';

const dirs: string[] = [];

function setup() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wbfm-pet-close-'));
  dirs.push(dir);
  const main = createFakeMain();
  let pet = createFakePetWindow();
  const createWindow = vi.fn(() => {
    pet = createFakePetWindow();
    return pet.win;
  });
  const manager = new PetManager({
    userDataDir: dir,
    boot: null,
    getMainWindow: () => main,
    createWindow,
    getCursor: () => ({ x: 0, y: 0 }),
    setInterval: () => 1 as unknown as ReturnType<typeof setInterval>,
  });
  return { dir, main, manager, createWindow, getPet: () => pet };
}

afterEach(() => {
  for (const dir of dirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
  vi.clearAllMocks();
});

describe('PetManager 关闭原因与模型记忆', () => {
  it('渲染进程崩溃：广播 crash 原因并记录 reason/exitCode', async () => {
    const { main, manager, getPet } = setup();
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      await manager.open('haru');
      const onMock = getPet().wc.on as unknown as ReturnType<typeof vi.fn>;
      const handler = onMock.mock.calls.find((call) => call[0] === 'render-process-gone')?.[1] as
        | ((event: unknown, details: unknown) => void)
        | undefined;
      expect(handler).toBeTypeOf('function');
      handler!({}, { reason: 'crashed', exitCode: 1 });
      expect(main.webContents.send).toHaveBeenLastCalledWith('pet:open-changed', {
        open: false,
        reason: 'crash',
      });
      expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('reason=crashed'));
    } finally {
      errorSpy.mockRestore();
    }
  });

  it('托盘/命令面板无 modelId 重开：沿用上次持久化模型，不回落 haru', async () => {
    const { dir, main, manager, createWindow } = setup();
    await manager.open('wanko');
    const saved = JSON.parse(fs.readFileSync(path.join(dir, 'pet-state.json'), 'utf8'));
    expect(saved.modelId).toBe('wanko');
    await manager.close();
    expect(createWindow).toHaveBeenCalledTimes(1);

    const reopened = createFakePetWindow();
    const open = vi.fn(() => reopened.win);
    const mgr = new PetManager({
      userDataDir: dir,
      boot: null,
      getMainWindow: () => main,
      createWindow: open,
      getCursor: () => ({ x: 0, y: 0 }),
      setInterval: () => 1 as unknown as ReturnType<typeof setInterval>,
    });
    await mgr.open();
    expect(open).toHaveBeenCalledWith(
      null,
      expect.objectContaining({ modelId: 'wanko' }),
      'wanko',
    );
  });

  it('唤回主窗时最小化先 restore', async () => {
    const { main, manager } = setup();
    (main.isMinimized as ReturnType<typeof vi.fn>).mockReturnValue(true);
    manager.focusMain();
    expect(main.restore).toHaveBeenCalledTimes(1);
    expect(main.show).toHaveBeenCalledTimes(1);
  });

  it('桌宠存活时拦截主窗关闭（改为隐藏）；prepareQuit 后放行且不再唤主窗', async () => {
    const { main, manager, getPet } = setup();
    await manager.open();
    const event = { preventDefault: vi.fn() };
    expect(manager.handleMainClose(event)).toBe(true);
    expect(event.preventDefault).toHaveBeenCalledTimes(1);
    expect(main.hide).toHaveBeenCalledTimes(1);

    // 桌宠关后不再拦截
    await manager.close();
    expect(manager.handleMainClose({ preventDefault: vi.fn() })).toBe(false);

    // 重新开窗后走退出路径
    await manager.open();
    (main.show as ReturnType<typeof vi.fn>).mockClear();
    manager.prepareQuit();
    expect(getPet().win.destroy).toHaveBeenCalled();
    expect(main.show).not.toHaveBeenCalled();
    const quitEvent = { preventDefault: vi.fn() };
    expect(manager.handleMainClose(quitEvent)).toBe(false);
    expect(quitEvent.preventDefault).not.toHaveBeenCalled();
  });
});
