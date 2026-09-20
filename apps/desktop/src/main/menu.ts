import { app, Menu, shell } from 'electron';

/** 基础应用菜单；开发态额外提供 DevTools/强制刷新 */
export function buildAppMenu(isDev: boolean): Menu {
  const template: Electron.MenuItemConstructorOptions[] = [
    {
      label: app.name,
      submenu: [{ role: 'about' }, { type: 'separator' }, { role: 'quit' }],
    },
    {
      label: '编辑',
      submenu: [
        { role: 'undo', label: '撤销' },
        { role: 'redo', label: '重做' },
        { type: 'separator' },
        { role: 'cut', label: '剪切' },
        { role: 'copy', label: '复制' },
        { role: 'paste', label: '粘贴' },
        { role: 'selectAll', label: '全选' },
      ],
    },
    {
      label: '视图',
      submenu: [
        { role: 'reload', label: '刷新' },
        { role: 'forceReload', label: '强制刷新' },
        ...(isDev ? [{ role: 'toggleDevTools' as const, label: '开发者工具' }] : []),
        { type: 'separator' },
        { role: 'resetZoom', label: '实际大小' },
        { role: 'zoomIn', label: '放大' },
        { role: 'zoomOut', label: '缩小' },
        { type: 'separator' },
        { role: 'togglefullscreen', label: '全屏' },
      ],
    },
    {
      label: '窗口',
      submenu: [{ role: 'minimize', label: '最小化' }, { role: 'close', label: '关闭' }],
    },
    {
      label: '帮助',
      submenu: [
        {
          label: '项目文档',
          click: () => void shell.openExternal('https://github.com/'),
        },
      ],
    },
  ];
  return Menu.buildFromTemplate(template);
}

export function installAppMenu(isDev: boolean): void {
  Menu.setApplicationMenu(buildAppMenu(isDev));
}
