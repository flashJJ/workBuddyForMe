/**
 * M0 Spike B：真实 Electron 透明桌宠窗冒烟。
 * 验证点：transparent/frameless/alwaysOnTop 窗口可创建、data: URL 可加载、
 * setIgnoreMouseEvents(true,{forward}) 与恢复切换不抛错、置顶与定位可用。
 * 约 1.5 秒后自动退出（屏幕左上会短暂出现一个半透明蓝圆，属预期）。
 *
 * 运行：pnpm --filter @wbfm/desktop exec electron spikes/pet-window-smoke.cjs
 */
const { app, BrowserWindow, screen } = require('electron');

app.whenReady().then(async () => {
  const failures = [];
  let win;
  try {
    win = new BrowserWindow({
      width: 240,
      height: 240,
      frame: false,
      transparent: true,
      alwaysOnTop: true,
      skipTaskbar: true,
      focusable: true,
      resizable: false,
      show: false,
      webPreferences: { sandbox: true },
    });
    win.setAlwaysOnTop(true, 'screen-saver');

    const body =
      '<!doctype html><html><body style="margin:0;background:transparent;overflow:hidden">' +
      '<div style="width:120px;height:120px;margin:60px;border-radius:50%;' +
      'background:rgba(100,180,255,.55);box-shadow:0 0 16px rgba(100,180,255,.6)">pet</div>' +
      '</body></html>';
    await win.loadURL(`data:text/html,${encodeURIComponent(body)}`);
    win.show();

    // 穿透 forward ↔ 可交互 往返切换（M4 滞回控制器将高频调用这两个状态）
    win.setIgnoreMouseEvents(true, { forward: true });
    win.setIgnoreMouseEvents(false);
    win.setIgnoreMouseEvents(true, { forward: true });

    const wa = screen.getPrimaryDisplay().workArea;
    win.setPosition(wa.x + 80, wa.y + 80);

    await new Promise((r) => setTimeout(r, 1500));

    if (!win.isVisible()) failures.push('window not visible');
    if (!win.webContents.isLoading && win.webContents.getURL().indexOf('data:') !== 0) {
      failures.push('unexpected loaded url: ' + win.webContents.getURL());
    }
  } catch (err) {
    failures.push(String(err && err.stack ? err.stack : err));
  } finally {
    if (win && !win.isDestroyed()) win.close();
  }

  console.log(failures.length === 0 ? 'SPIKE B RESULT: PASS' : 'SPIKE B RESULT: FAIL\n' + failures.join('\n'));
  app.exit(failures.length === 0 ? 0 : 1);
});
