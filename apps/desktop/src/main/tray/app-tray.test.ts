import { describe, expect, it, vi } from 'vitest';
import type { MenuItemConstructorOptions } from 'electron';

vi.mock('electron', () => ({
  app: { isPackaged: false },
  BrowserWindow: vi.fn(),
  shell: { openExternal: vi.fn() },
  Menu: { buildFromTemplate: vi.fn() },
  Tray: vi.fn(),
}));

import { buildTrayMenuTemplate, type TrayActions } from './app-tray';

function createActions(): TrayActions {
  return {
    showMain: vi.fn(),
    hideMain: vi.fn(),
    togglePet: vi.fn(),
    openStage: vi.fn(),
    quit: vi.fn(),
  };
}

function find(items: MenuItemConstructorOptions[], label: string): MenuItemConstructorOptions {
  const item = items.find((entry) => entry.label === label);
  if (!item) throw new Error(`菜单项缺失：${label}`);
  return item;
}

function click(item: MenuItemConstructorOptions): void {
  (item.click as (() => void) | undefined)?.();
}

describe('桌面常驻托盘菜单', () => {
  it('主窗可见时「显示」禁用、「隐藏」可点', () => {
    const actions = createActions();
    const items = buildTrayMenuTemplate(
      { mainVisible: true, petOpen: false, hasStage: false },
      actions,
    );
    expect(find(items, '显示主窗口').enabled).toBe(false);
    const hide = find(items, '隐藏主窗口');
    expect(hide.enabled).toBe(true);
    click(hide);
    expect(actions.hideMain).toHaveBeenCalledTimes(1);
  });

  it('主窗隐藏时「显示」可点，点击唤回主窗', () => {
    const actions = createActions();
    const items = buildTrayMenuTemplate(
      { mainVisible: false, petOpen: true, hasStage: false },
      actions,
    );
    const show = find(items, '显示主窗口');
    expect(show.enabled).toBe(true);
    click(show);
    expect(actions.showMain).toHaveBeenCalledTimes(1);
  });

  it('桌宠开关是勾选项，点击切换', () => {
    const actions = createActions();
    const items = buildTrayMenuTemplate(
      { mainVisible: true, petOpen: true, hasStage: false },
      actions,
    );
    const pet = find(items, '桌宠');
    expect(pet.type).toBe('checkbox');
    expect(pet.checked).toBe(true);
    click(pet);
    expect(actions.togglePet).toHaveBeenCalledTimes(1);
  });

  it('舞台入口按可用性出现', () => {
    const actions = createActions();
    const withoutStage = buildTrayMenuTemplate(
      { mainVisible: true, petOpen: false, hasStage: false },
      actions,
    );
    expect(withoutStage.some((item) => item.label === '打开全屏舞台…')).toBe(false);

    const withStage = buildTrayMenuTemplate(
      { mainVisible: true, petOpen: false, hasStage: true },
      actions,
    );
    click(find(withStage, '打开全屏舞台…'));
    expect(actions.openStage).toHaveBeenCalledTimes(1);
  });

  it('「彻底退出」始终是最后一项且触发退出', () => {
    const actions = createActions();
    const items = buildTrayMenuTemplate(
      { mainVisible: true, petOpen: true, hasStage: true },
      actions,
    );
    const quit = items.at(-1);
    expect(quit?.label).toBe('彻底退出 WorkBuddyForMe');
    if (quit) click(quit);
    expect(actions.quit).toHaveBeenCalledTimes(1);
  });
});
