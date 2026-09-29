import { BrowserWindow, screen } from 'electron';

/**
 * 点击指示圈（M2 可视反馈）：执行点击前在落点显示一个半透明圆环动画，
 * 让用户看到「要点哪」。窗口无边框、透明、点击穿透、不抢焦点、跳过任务栏。
 * 输入坐标为物理像素，窗口定位用 screen.screenToDipPoint 转 DIP。
 */

const SIZE_DIP = 72; // 指示圈窗口边长（DIP）
const SHOW_MS = 450; // 动画时长，结束后隐藏窗口

const OVERLAY_HTML = `data:text/html,${encodeURIComponent(`<!doctype html><html><body style="margin:0;background:transparent;overflow:hidden">
<div id="c"></div><style>
#c{position:absolute;inset:0;margin:auto;width:56px;height:56px;border-radius:50%;
border:4px solid rgba(255,80,80,.9);box-shadow:0 0 12px rgba(255,80,80,.55);
animation:p .45s ease-out forwards}
@keyframes p{0%{transform:scale(.25);opacity:.95}70%{opacity:.9}100%{transform:scale(1.15);opacity:0}}
</style></body></html>`)}`;

export interface ClickOverlay {
  /** 在物理像素坐标处展示一次点击指示圈（异步不阻塞键鼠动作） */
  showClick(x: number, y: number): void;
  close(): void;
}

export interface ClickOverlayOptions {
  /** 测试注入：窗口工厂（默认真实 BrowserWindow） */
  createWindow?: () => OverlayWindowLike;
  showMs?: number;
  /** 物理坐标 → DIP 换算（默认 electron screen） */
  toDip?: (point: { x: number; y: number }) => { x: number; y: number };
  now?: typeof setTimeout;
}

export interface OverlayWindowLike {
  setBounds(bounds: { x: number; y: number; width: number; height: number }): void;
  show(): void;
  hide(): void;
  reload(): void;
  close(): void;
  isDestroyed(): boolean;
}

export function createClickOverlay(options: ClickOverlayOptions = {}): ClickOverlay {
  const showMs = options.showMs ?? SHOW_MS;
  const toDip = options.toDip ?? ((p: { x: number; y: number }) => screen.screenToDipPoint(p));
  const schedule = options.now ?? setTimeout;

  let win: OverlayWindowLike | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;

  function ensureWindow(): OverlayWindowLike {
    if (win && !win.isDestroyed()) return win;
    if (options.createWindow) {
      win = options.createWindow();
      return win;
    }
    const bw = new BrowserWindow({
      width: SIZE_DIP,
      height: SIZE_DIP,
      frame: false,
      transparent: true,
      alwaysOnTop: true,
      skipTaskbar: true,
      focusable: false,
      show: false,
      resizable: false,
      webPreferences: { sandbox: true },
    });
    bw.setIgnoreMouseEvents(true);
    bw.setAlwaysOnTop(true, 'screen-saver');
    void bw.loadURL(OVERLAY_HTML);
    win = bw;
    return win;
  }

  return {
    showClick(x, y) {
      try {
        const w = ensureWindow();
        const dip = toDip({ x, y });
        w.setBounds({
          x: Math.round(dip.x - SIZE_DIP / 2),
          y: Math.round(dip.y - SIZE_DIP / 2),
          width: SIZE_DIP,
          height: SIZE_DIP,
        });
        w.reload(); // 重放 CSS 动画
        w.show();
        if (timer) clearTimeout(timer);
        timer = schedule(() => {
          if (win && !win.isDestroyed()) win.hide();
        }, showMs);
      } catch (error) {
        // 指示圈失败不阻断键鼠动作
        console.error('[wbfm] 点击指示圈展示失败:', error);
      }
    },
    close() {
      if (timer) clearTimeout(timer);
      if (win && !win.isDestroyed()) win.close();
      win = null;
    },
  };
}
