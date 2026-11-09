import { describe, expect, it, vi } from 'vitest';
import {
  PetSitController,
  SIT_FOLLOW_MS,
  SIT_MIN_DRAG_MS,
  type PetSitWindow,
  type SitRect,
} from './pet-sit-controller';
import type { WindowEdge } from './win32-windows';

const SIZE = { width: 260, height: 340 };

function fakeWindow(initial: SitRect) {
  let bounds = { ...initial };
  const win: PetSitWindow = {
    isDestroyed: () => false,
    getBounds: () => ({ ...bounds }),
    setBounds: (next) => {
      bounds = { ...next };
    },
    setPosition: (x, y) => {
      bounds = { ...bounds, x, y };
    },
  };
  return { win, read: () => bounds };
}

function fakeClock() {
  let now = 0;
  return {
    now: () => now,
    advance: (ms: number) => {
      now += ms;
    },
  };
}

interface Harness {
  controller: PetSitController;
  tick: () => void;
  onSettle: ReturnType<typeof vi.fn>;
  clearInterval: ReturnType<typeof vi.fn>;
  setWindows: (edges: WindowEdge[]) => void;
}

function createHarness(clock: ReturnType<typeof fakeClock>): Harness {
  let tick: () => void = () => undefined;
  let windows: WindowEdge[] = [];
  const onSettle = vi.fn();
  const clearInterval = vi.fn();
  const controller = new PetSitController({
    getFixedSize: () => SIZE,
    getWorkArea: () => null,
    getDisplayBounds: () => null,
    listWindows: () => windows,
    setInterval: (cb: () => void) => {
      tick = cb;
      return 1 as unknown as ReturnType<typeof setInterval>;
    },
    clearInterval,
    now: clock.now,
    onSettle,
  });
  return {
    controller,
    tick: () => tick(),
    onSettle,
    clearInterval,
    setWindows: (edges) => {
      windows = edges;
    },
  };
}

describe('PetSitController（v3.0 P1 窗口坐立）', () => {
  it('拖拽不足 1s 不吸附', () => {
    const clock = fakeClock();
    const h = createHarness(clock);
    const { win } = fakeWindow({ x: 100, y: 500, ...SIZE });
    h.setWindows([{ handle: 7, rect: { x: 0, y: 855, width: 800, height: 600 } }]);
    h.controller.beginDrag();
    clock.advance(SIT_MIN_DRAG_MS - 1);
    expect(h.controller.trySit(win)).toBe(false);
    expect(h.controller.isSitting()).toBe(false);
  });

  it('脚底落在窗口顶边 24px 内 → 吸附并对齐边缘', () => {
    const clock = fakeClock();
    const h = createHarness(clock);
    const fake = fakeWindow({ x: 100, y: 500, ...SIZE }); // feet = 840
    h.setWindows([{ handle: 7, rect: { x: 0, y: 855, width: 800, height: 600 } }]);
    h.controller.beginDrag();
    clock.advance(SIT_MIN_DRAG_MS);
    expect(h.controller.trySit(fake.win)).toBe(true);
    expect(h.controller.isSitting()).toBe(true);

    for (let i = 0; i < 8; i += 1) h.tick();
    expect(fake.read().y).toBe(855 - SIZE.height);
    expect(fake.read().width).toBe(SIZE.width);
    expect(h.onSettle).toHaveBeenCalledTimes(1);
  });

  it('底部任务栏：工作区底边作为坐面', () => {
    const clock = fakeClock();
    let tick: () => void = () => undefined;
    const fake = fakeWindow({ x: 1800, y: 680, ...SIZE }); // feet = 1020
    const onSettle = vi.fn();
    const controller = new PetSitController({
      getFixedSize: () => SIZE,
      getWorkArea: () => ({ x: 0, y: 0, width: 1920, height: 1000 }),
      getDisplayBounds: () => ({ x: 0, y: 0, width: 1920, height: 1040 }),
      listWindows: () => [],
      setInterval: (cb: () => void) => {
        tick = cb;
        return 1 as unknown as ReturnType<typeof setInterval>;
      },
      clearInterval: vi.fn(),
      now: clock.now,
      onSettle,
    });
    controller.beginDrag();
    clock.advance(SIT_MIN_DRAG_MS);
    expect(controller.trySit(fake.win)).toBe(true);
    for (let i = 0; i < 8; i += 1) tick();
    expect(fake.read().y).toBe(1000 - SIZE.height);
    // 水平方向夹在工作区内
    expect(fake.read().x).toBe(1920 - 8 - SIZE.width);
  });

  it('再次拖拽立即解除；目标窗口消失后停止跟随', () => {
    const clock = fakeClock();
    const h = createHarness(clock);
    const fake = fakeWindow({ x: 100, y: 500, ...SIZE });
    h.setWindows([{ handle: 7, rect: { x: 0, y: 855, width: 800, height: 600 } }]);
    h.controller.beginDrag();
    clock.advance(SIT_MIN_DRAG_MS);
    expect(h.controller.trySit(fake.win)).toBe(true);

    h.controller.beginDrag();
    expect(h.controller.isSitting()).toBe(false);
    expect(h.clearInterval).toHaveBeenCalled();

    clock.advance(SIT_MIN_DRAG_MS);
    expect(h.controller.trySit(fake.win)).toBe(true);
    h.setWindows([]);
    h.tick();
    expect(h.controller.isSitting()).toBe(false);
  });

  it('跟随间隔为 125ms（约 8fps）', () => {
    expect(SIT_FOLLOW_MS).toBe(125);
  });
});
