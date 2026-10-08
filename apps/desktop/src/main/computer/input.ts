import { Button, Key, keyboard, mouse, Point } from '@nut-tree-fork/nut-js';
import type { KeyName, MouseButton } from '@wbfm/shared/schemas';

/**
 * v0.7 M2 键鼠执行薄封装（注入式可测）。
 * 坐标一律为真实屏幕物理像素——与 screen_snapshot 换算回的坐标系一致；
 * nut-js/libnut 在 DPI-aware 进程下使用物理像素，无需再做 DIP 换算。
 */
export interface InputBackend {
  moveMouse(x: number, y: number): Promise<void>;
  getMousePosition(): Promise<{ x: number; y: number }>;
  click(button: MouseButton, double: boolean): Promise<void>;
  scroll(dx: number, dy: number): Promise<void>;
  typeText(text: string): Promise<void>;
  pressKeys(keys: KeyName[]): Promise<void>;
}

const BUTTON_MAP: Record<MouseButton, Button> = {
  left: Button.LEFT,
  right: Button.RIGHT,
  middle: Button.MIDDLE,
};

/** KeyName → nut-js Key 枚举映射（取各键左手位） */
const KEY_MAP: Record<KeyName, Key> = {
  control: Key.LeftControl,
  shift: Key.LeftShift,
  alt: Key.LeftAlt,
  meta: Key.LeftSuper,
  enter: Key.Enter,
  escape: Key.Escape,
  tab: Key.Tab,
  space: Key.Space,
  backspace: Key.Backspace,
  delete: Key.Delete,
  up: Key.Up,
  down: Key.Down,
  left: Key.Left,
  right: Key.Right,
  home: Key.Home,
  end: Key.End,
  pageup: Key.PageUp,
  pagedown: Key.PageDown,
  f1: Key.F1, f2: Key.F2, f3: Key.F3, f4: Key.F4, f5: Key.F5, f6: Key.F6,
  f7: Key.F7, f8: Key.F8, f9: Key.F9, f10: Key.F10, f11: Key.F11, f12: Key.F12,
  a: Key.A, b: Key.B, c: Key.C, d: Key.D, e: Key.E, f: Key.F, g: Key.G,
  h: Key.H, i: Key.I, j: Key.J, k: Key.K, l: Key.L, m: Key.M, n: Key.N,
  o: Key.O, p: Key.P, q: Key.Q, r: Key.R, s: Key.S, t: Key.T, u: Key.U,
  v: Key.V, w: Key.W, x: Key.X, y: Key.Y, z: Key.Z,
  0: Key.Num0, 1: Key.Num1, 2: Key.Num2, 3: Key.Num3, 4: Key.Num4,
  5: Key.Num5, 6: Key.Num6, 7: Key.Num7, 8: Key.Num8, 9: Key.Num9,
};

/** 设置剪贴板文本（Electron 主进程 clipboard）；测试可注入 */
export type ClipboardSetter = (text: string) => void;

export interface NutInputOptions {
  /** 非 ASCII 文本输入走「剪贴板 + Ctrl+V」粘贴（libnut 逐键敲中文不可靠） */
  setClipboard?: ClipboardSetter;
  /** 每次动作前的等待（ms），给用户看到指示圈的反应时间；默认 300 */
  preActionDelayMs?: number;
  sleep?: (ms: number) => Promise<void>;
}

// ASCII 判定的字符类必须覆盖 0x00-0x1F 控制区段（正则本意即匹配完整 7 位 ASCII）
// eslint-disable-next-line no-control-regex
const isAscii = (s: string): boolean => /^[\x00-\x7F]*$/.test(s);

export function createNutInputBackend(options: NutInputOptions = {}): InputBackend {
  const setClipboard = options.setClipboard;
  const delay = options.preActionDelayMs ?? 300;
  const sleep = options.sleep ?? ((ms: number) => new Promise((r) => setTimeout(r, ms)));

  keyboard.config.autoDelayMs = 20;

  async function beforeAction(): Promise<void> {
    if (delay > 0) await sleep(delay);
  }

  return {
    async moveMouse(x, y) {
      await mouse.setPosition(new Point(x, y));
    },

    async getMousePosition() {
      const p = await mouse.getPosition();
      return { x: Math.round(p.x), y: Math.round(p.y) };
    },

    async click(button, double) {
      await beforeAction();
      const b = BUTTON_MAP[button];
      if (double) await mouse.doubleClick(b);
      else await mouse.click(b);
    },

    async scroll(dx, dy) {
      if (dy > 0) await mouse.scrollUp(dy);
      if (dy < 0) await mouse.scrollDown(-dy);
      if (dx > 0) await mouse.scrollRight(dx);
      if (dx < 0) await mouse.scrollLeft(-dx);
    },

    async typeText(text) {
      await beforeAction();
      if (isAscii(text) || !setClipboard) {
        await keyboard.type(text);
        return;
      }
      // 非 ASCII（中文等）：libnut 逐键输入不可靠，改走剪贴板粘贴
      setClipboard(text);
      await keyboard.pressKey(Key.LeftControl, Key.V);
      await keyboard.releaseKey(Key.V, Key.LeftControl);
    },

    async pressKeys(keys) {
      await beforeAction();
      const mapped = keys.map((k) => KEY_MAP[k] as Key);
      await keyboard.pressKey(...mapped);
      await keyboard.releaseKey(...[...mapped].reverse());
    },
  };
}
