import { describe, expect, it } from 'vitest';
import { createClickOverlay, type OverlayWindowLike } from './overlay';

function fakeWindow(): OverlayWindowLike & { bounds: unknown[]; readonly shown: number; readonly hidden: number } {
  const state = { bounds: [] as unknown[], shown: 0, hidden: 0 };
  return {
    get bounds() {
      return state.bounds;
    },
    get shown() {
      return state.shown;
    },
    get hidden() {
      return state.hidden;
    },
    setBounds(b) {
      state.bounds.push(b);
    },
    show() {
      state.shown += 1;
    },
    hide() {
      state.hidden += 1;
    },
    reload() {},
    close() {},
    isDestroyed: () => false,
  };
}

describe('点击指示圈', () => {
  it('物理坐标转 DIP 后居中定位并展示', () => {
    const win = fakeWindow();
    const overlay = createClickOverlay({
      createWindow: () => win,
      toDip: (p) => ({ x: p.x / 2, y: p.y / 2 }), // 200% 缩放
      showMs: 10,
      now: (() => 0) as never,
    });
    overlay.showClick(200, 100);
    expect(win.bounds).toEqual([{ x: 100 - 36, y: 50 - 36, width: 72, height: 72 }]);
    expect(win.shown).toBe(1);
  });

  it('窗口工厂异常不阻断动作（静默降级）', () => {
    const overlay = createClickOverlay({
      createWindow: () => {
        throw new Error('no display');
      },
    });
    expect(() => overlay.showClick(1, 2)).not.toThrow();
  });
});
