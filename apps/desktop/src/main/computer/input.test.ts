import { beforeEach, describe, expect, it, vi } from 'vitest';

// vi.mock 提升：模拟 nut-js，避免加载原生模块 / 真实键鼠动作
const calls: string[] = [];
vi.mock('@nut-tree-fork/nut-js', () => {
  class Point {
    constructor(
      public x: number,
      public y: number,
    ) {}
  }
  return {
    Point,
    Button: { LEFT: 0, RIGHT: 1, MIDDLE: 2 },
    Key: new Proxy(
      { LeftControl: 'LeftControl', V: 'V', LeftShift: 'LeftShift' },
      { get: (t, p) => (p in t ? (t as Record<string | symbol, unknown>)[p] : String(p)) },
    ),
    mouse: {
      setPosition: vi.fn(async (p: { x: number; y: number }) => {
        calls.push(`setPosition:${p.x},${p.y}`);
      }),
      getPosition: vi.fn(async () => new Point(7, 9)),
      click: vi.fn(async (b: number) => {
        calls.push(`click:${b}`);
      }),
      doubleClick: vi.fn(async (b: number) => {
        calls.push(`doubleClick:${b}`);
      }),
      scrollUp: vi.fn(async (n: number) => void calls.push(`scrollUp:${n}`)),
      scrollDown: vi.fn(async (n: number) => void calls.push(`scrollDown:${n}`)),
      scrollRight: vi.fn(async (n: number) => void calls.push(`scrollRight:${n}`)),
      scrollLeft: vi.fn(async (n: number) => void calls.push(`scrollLeft:${n}`)),
    },
    keyboard: {
      config: { autoDelayMs: 0 },
      type: vi.fn(async (t: string) => void calls.push(`type:${t}`)),
      pressKey: vi.fn(async (...k: string[]) => void calls.push(`press:${k.join('+')}`)),
      releaseKey: vi.fn(async (...k: string[]) => void calls.push(`release:${k.join('+')}`)),
    },
  };
});

import { createNutInputBackend } from './input';

describe('nut-js 键鼠封装', () => {
  beforeEach(() => {
    calls.length = 0;
  });

  const backend = (overrides: Parameters<typeof createNutInputBackend>[0] = {}) =>
    createNutInputBackend({ preActionDelayMs: 0, ...overrides });

  it('移动/读回位置（坐标取整）', async () => {
    const b = backend();
    await b.moveMouse(100, 200);
    expect(calls).toEqual(['setPosition:100,200']);
    expect(await b.getMousePosition()).toEqual({ x: 7, y: 9 });
  });

  it('单击/双击/右键映射', async () => {
    const b = backend();
    await b.click('left', false);
    await b.click('right', true);
    expect(calls).toEqual(['click:0', 'doubleClick:1']);
  });

  it('滚动方向映射（dy 正上负下，dx 正右负左）', async () => {
    const b = backend();
    await b.scroll(3, -5);
    await b.scroll(-2, 4);
    // 实现顺序：先垂直后水平
    expect(calls).toEqual(['scrollDown:5', 'scrollRight:3', 'scrollUp:4', 'scrollLeft:2']);
  });

  it('ASCII 文本走 keyboard.type', async () => {
    const b = backend({ setClipboard: () => calls.push('clipboard') });
    await b.typeText('hello world');
    expect(calls).toEqual(['type:hello world']);
  });

  it('非 ASCII 文本走剪贴板 + Ctrl+V 粘贴', async () => {
    const clip: string[] = [];
    const b = backend({ setClipboard: (t) => clip.push(t) });
    await b.typeText('你好，世界');
    expect(clip).toEqual(['你好，世界']);
    expect(calls).toEqual(['press:LeftControl+V', 'release:V+LeftControl']);
  });

  it('组合键按下后逆序释放', async () => {
    const b = backend();
    await b.pressKeys(['control', 's']);
    expect(calls).toEqual(['press:LeftControl+S', 'release:S+LeftControl']);
  });

  it('动作前延迟（sleep 注入可观测）', async () => {
    const slept: number[] = [];
    const b = backend({ sleep: async (ms) => void slept.push(ms), preActionDelayMs: 300 });
    await b.click('left', false);
    expect(slept).toEqual([300]);
    // moveMouse / scroll 属定位与浏览，不加延迟
    await b.moveMouse(1, 1);
    await b.scroll(0, 1);
    expect(slept).toEqual([300]);
  });
});
