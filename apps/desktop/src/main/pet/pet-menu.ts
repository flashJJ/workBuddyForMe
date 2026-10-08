/**
 * 桌宠右键菜单（v1.1 M2 从 pet-manager 抽出，模板零改动）。
 *
 * 两条触发路径（在 manager 侧接线）：
 *  - 头部 no-drag 区：渲染层 onContextMenu → pet:show-menu IPC；
 *  - 身体 drag 区（非客户区，DOM 事件被吞）：Electron 'system-context-menu'
 *    事件 preventDefault 后走本菜单。
 *
 * 必须显式指定所属窗口 popup：桌宠经 showInactive 弹出、通常不是活动窗口，
 * popup({}) 无主窗口时菜单可能不显示或立即消失。
 */
import { Menu, type BrowserWindow } from 'electron';

/** 菜单动作集（manager 组装并注入持久化/关窗副作用） */
export interface PetContextMenuActions {
  isClickThrough: boolean;
  focusMain(): void;
  toggleClickThrough(): void;
  hide(): void;
}

/** 仅用于 popup({ window })；真实场景传 Electron BrowserWindow（测试传假窗） */
export type PetMenuWindow = unknown;

/** 测试可注入菜单弹出（默认 Electron Menu） */
export type ShowPetContextMenu = (
  win: PetMenuWindow,
  actions: PetContextMenuActions,
) => void;

/** 默认 Electron 菜单：回主窗 / 鼠标穿透勾选 / 隐藏桌宠 */
export const showDefaultPetContextMenu: ShowPetContextMenu = (win, actions) => {
  const menu = Menu.buildFromTemplate([
    { label: '回到主窗口', click: () => actions.focusMain() },
    {
      label: '鼠标穿透（点击落到下层）',
      type: 'checkbox',
      checked: actions.isClickThrough,
      click: () => actions.toggleClickThrough(),
    },
    { type: 'separator' },
    { label: '隐藏桌宠', click: () => actions.hide() },
  ]);
  menu.popup({ window: win as unknown as BrowserWindow });
};
