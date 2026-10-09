import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const menuMocks = vi.hoisted(() => ({
  buildFromTemplate: vi.fn(),
  popup: vi.fn(),
}));
vi.mock('electron', () => ({
  Menu: { buildFromTemplate: menuMocks.buildFromTemplate },
}));

import type { PetContextMenuActions } from './pet-menu';
import { PetManager } from './pet-manager';
import { createFakeIpc, createFakeMain, createFakePetWindow } from './pet-test-fixtures';

describe('PetManager', () => {
  let dir: string;
  let main: ReturnType<typeof createFakeMain>;
  let pet: ReturnType<typeof createFakePetWindow>;
  let createWindow: ReturnType<typeof vi.fn>;
  let ipcKit: ReturnType<typeof createFakeIpc>;
  let manager: PetManager;
  let menuActions: PetContextMenuActions | null;
  let cursor: { x: number; y: number };

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wbfm-pet-mgr-'));
    main = createFakeMain();
    pet = createFakePetWindow();
    createWindow = vi.fn(() => {
      // 每次开窗外发新伪窗（与真实 createPetWindow 语义一致）
      pet = createFakePetWindow();
      return pet.win;
    });
    ipcKit = createFakeIpc();
    menuActions = null;
    // 默认光标在窗口外；个别用例直接改 cursor 驱动手势
    cursor = { x: 0, y: 0 };
    manager = new PetManager({
      userDataDir: dir,
      boot: { url: 'http://127.0.0.1:59999', token: 't' },
      getMainWindow: () => main,
      createWindow,
      showContextMenu: (_win, actions) => {
        menuActions = actions;
      },
      getCursor: () => cursor,
      setInterval: () => 1 as unknown as ReturnType<typeof setInterval>,
      clearInterval: vi.fn(),
    });
    manager.registerIpc(ipcKit.ipc);
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
    vi.clearAllMocks();
  });

  it('open 幂等：同模型不重建，初始穿透开，向主窗广播开关', async () => {
    const open = vi.fn(() => pet.win);
    const mgr = new PetManager({
      userDataDir: dir,
      boot: null,
      getMainWindow: () => main,
      createWindow: open,
      getCursor: () => ({ x: 0, y: 0 }),
      setInterval: () => 1 as unknown as ReturnType<typeof setInterval>,
    });
    expect(await mgr.open('hiyori')).toBe(true);
    expect(await mgr.open('hiyori')).toBe(true);
    expect(open).toHaveBeenCalledTimes(1);
    expect(open).toHaveBeenCalledWith(null, expect.objectContaining({ clickThrough: true }), 'hiyori');
    expect(pet.setIgnore).toHaveBeenLastCalledWith(true, { forward: true });
    expect(main.webContents.send).toHaveBeenLastCalledWith('pet:open-changed', true);
  });

  it('换模型：原位销毁重建新窗、不唤主窗、不重复广播开关', async () => {
    const broadcasts: unknown[] = [];
    (main.webContents.send as ReturnType<typeof vi.fn>).mockImplementation(
      (channel: string, value: unknown) => {
        if (channel === 'pet:open-changed') broadcasts.push(value);
      },
    );
    await manager.open('haru');
    expect(createWindow).toHaveBeenCalledTimes(1);

    await manager.open('wanko');
    expect(createWindow).toHaveBeenCalledTimes(2);
    expect(createWindow).toHaveBeenLastCalledWith(
      expect.anything(),
      expect.objectContaining({ x: 321, y: 432 }),
      'wanko',
    );
    // 旧窗被销毁（换模型），但主窗没被唤回，也没广播 false
    expect(main.show).not.toHaveBeenCalled();
    expect(broadcasts).toEqual([true]);
  });

  it('close 持久化位置、广播关闭并唤回主窗；关后中继事件被丢弃', async () => {
    await manager.open();
    await manager.close();
    const saved = JSON.parse(fs.readFileSync(path.join(dir, 'pet-state.json'), 'utf8'));
    expect(saved.x).toBe(321);
    expect(saved.y).toBe(432);
    expect(main.webContents.send).toHaveBeenLastCalledWith('pet:open-changed', false);
    expect(main.show).toHaveBeenCalled();
    expect(main.focus).toHaveBeenCalled();

    const callsAfterClose = (pet.wc.send as ReturnType<typeof vi.fn>).mock.calls.length;
    manager.relayPerformance({ kind: 'state', state: 'speaking' });
    expect((pet.wc.send as ReturnType<typeof vi.fn>).mock.calls).toHaveLength(callsAfterClose);
  });

  it('IPC 发送方身份校验：悬停只认桌宠、中继只认主窗', async () => {
    await manager.open();

    // 桌宠上报 hover=true → 滞回立即关穿透
    ipcKit.emit('pet:hover', pet.wc, true);
    expect(pet.setIgnore).toHaveBeenLastCalledWith(false, { forward: false });
    // 主窗伪造 hover → 忽略
    const calls = pet.setIgnore.mock.calls.length;
    ipcKit.emit('pet:hover', main.webContents, true);
    expect(pet.setIgnore.mock.calls).toHaveLength(calls);

    // 主窗中继合法事件 → 转发到桌宠
    ipcKit.emit('pet:relay', main.webContents, { kind: 'state', state: 'thinking' });
    expect(pet.wc.send).toHaveBeenLastCalledWith('pet:performance', {
      kind: 'state',
      state: 'thinking',
    });
    // 桌宠伪造中继 → 丢弃；非法载荷 → 丢弃
    ipcKit.emit('pet:relay', pet.wc, { kind: 'state', state: 'thinking' });
    ipcKit.emit('pet:relay', main.webContents, { kind: 'evil' });
    const last = (pet.wc.send as ReturnType<typeof vi.fn>).mock.calls.at(-1);
    expect(last).toEqual(['pet:performance', { kind: 'state', state: 'thinking' }]);

    // 双击回主窗仅桌宠可触发
    ipcKit.emit('pet:focus-main', pet.wc);
    expect(main.focus).toHaveBeenCalledTimes(1);
    ipcKit.emit('pet:focus-main', main.webContents);
    expect(main.focus).toHaveBeenCalledTimes(1);

    // 非主窗调 open/close 被拒
    expect(await ipcKit.invoke('pet:open', pet.wc, 'wanko')).toBe(true);
    // 工厂仍只在首次 open 造过一次（非法 open 没造窗）
  });

  it('右键菜单动作：回主窗/切换穿透并持久化/隐藏桌宠', async () => {
    await manager.open();
    // 经渲染层右键 IPC 触发菜单收集动作集
    ipcKit.emit('pet:show-menu', pet.wc);
    expect(menuActions).not.toBeNull();
    expect(menuActions!.isClickThrough).toBe(true);

    menuActions!.toggleClickThrough();
    expect(pet.setIgnore).toHaveBeenLastCalledWith(false, { forward: false });
    expect(JSON.parse(fs.readFileSync(path.join(dir, 'pet-state.json'), 'utf8')).clickThrough).toBe(false);

    menuActions!.focusMain();
    expect(main.focus).toHaveBeenCalledTimes(1);

    menuActions!.hide();
    expect(main.webContents.send).toHaveBeenLastCalledWith('pet:open-changed', false);
  });

  it('桌宠存活时拦截主窗关闭（改为隐藏）；prepareQuit 后放行且不再唤主窗', async () => {
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
    expect(pet.win.destroy).toHaveBeenCalled();
    expect(main.show).not.toHaveBeenCalled();
    const quitEvent = { preventDefault: vi.fn() };
    expect(manager.handleMainClose(quitEvent)).toBe(false);
    expect(quitEvent.preventDefault).not.toHaveBeenCalled();
  });

  it('唤回主窗时最小化先 restore', async () => {
    (main.isMinimized as ReturnType<typeof vi.fn>).mockReturnValue(true);
    manager.focusMain();
    expect(main.restore).toHaveBeenCalledTimes(1);
    expect(main.show).toHaveBeenCalledTimes(1);
  });

  it('手动拖拽 IPC 身份校验：非桌宠发送方拒绝（手势数值逻辑见 pet-drag-controller.test）', async () => {
    await manager.open();
    ipcKit.emit('pet:drag-begin', main.webContents);
    ipcKit.emit('pet:drag-to', main.webContents);
    ipcKit.emit('pet:drag-end', main.webContents);
    expect(pet.setPosition).not.toHaveBeenCalled();
  });

  it('右键菜单：头部 IPC 仅桌宠发送方可弹；身体 drag 区经 system-context-menu 弹并阻止系统菜单', async () => {
    await manager.open();
    // 头部路径：主窗伪造被拒
    ipcKit.emit('pet:show-menu', main.webContents);
    expect(menuActions).toBeNull();
    // 桌宠渲染层触发
    ipcKit.emit('pet:show-menu', pet.wc);
    expect(menuActions).not.toBeNull();

    // 身体 drag 区：Electron system-context-menu（非客户区右键）
    menuActions = null;
    const preventDefault = vi.fn();
    const winOn = pet.win.on as ReturnType<typeof vi.fn>;
    const onSysMenu = winOn.mock.calls.find((c) => c[0] === 'system-context-menu')?.[1] as
      | ((e: { preventDefault(): void }) => void)
      | undefined;
    expect(onSysMenu).toBeTypeOf('function');
    onSysMenu!({ preventDefault });
    expect(preventDefault).toHaveBeenCalledTimes(1);
    expect(menuActions).not.toBeNull();
  });

  it('未注入菜单工厂时默认使用 Electron Menu 弹出（模板含三个动作）', async () => {
    menuMocks.buildFromTemplate.mockReturnValue({ popup: menuMocks.popup });
    const mgr = new PetManager({
      userDataDir: dir,
      boot: null,
      getMainWindow: () => main,
      createWindow: () => pet.win,
      getCursor: () => ({ x: 0, y: 0 }),
      setInterval: () => 1 as unknown as ReturnType<typeof setInterval>,
    });
    await mgr.open();
    mgr.requestMenu();
    expect(menuMocks.buildFromTemplate).toHaveBeenCalledTimes(1);
    expect(menuMocks.popup).toHaveBeenCalled();
  });
});
