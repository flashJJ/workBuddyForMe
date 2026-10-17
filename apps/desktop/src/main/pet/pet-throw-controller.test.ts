import { describe, expect, it, vi } from 'vitest';
import type { Rect } from './pet-state';
import type { PetDragWindow } from './pet-drag-controller';
import { PetThrowController, THROW_FRAME_MS, type PetThrowDeps } from './pet-throw-controller';

const AREA: Rect = { x: 0, y: 0, width: 1920, height: 1040 };
const SIZE = { width: 260, height: 340 };

/** 可驱动的帧定时器：捕获 tick 回调手动推进（返回 vi.fn 供断言） */
function makeTimers() {
  let cb: (() => void) | null = null;
  const set = vi.fn((fn: () => void) => {
    cb = fn;
    return 1;
  });
  const clear = vi.fn();
  const deps = {
    setInterval: set as unknown as typeof setInterval,
    clearInterval: clear as unknown as typeof clearInterval,
  };
  return { deps, set, clear, tick: () => cb?.() };
}

function makeWindow(bounds: { x: number; y: number }, destroyed = false) {
  const state = { ...bounds, ...SIZE };
  const win = {
    isDestroyed: () => destroyed,
    getBounds: () => ({ ...state }),
    setPosition: (x: number, y: number) => {
      state.x = x;
      state.y = y;
    },
  } as unknown as PetDragWindow;
  return { win, state };
}

function makeController(overrides: Partial<PetThrowDeps> = {}) {
  const timers = makeTimers();
  const onSettle = vi.fn();
  const controller = new PetThrowController({
    ...timers.deps,
    getWorkArea: () => AREA,
    onSettle,
    ...overrides,
  });
  return { controller, timers, onSettle };
}

describe('PetThrowController 惯性滑行', () => {
  it('速度低于停止阈值：不滑行，直接贴边回正 + 落位持久化', () => {
    const { controller, timers, onSettle } = makeController();
    // 距右边缘 10 DIP（<= 进入阈值 28）→ 贴右：x = 1920 - 260 - 8
    const { win, state } = makeWindow({ x: 1650, y: 400 });

    controller.start(win, { x: 0, y: 0 });

    expect(timers.set).not.toHaveBeenCalled();
    expect(state.x).toBe(1920 - 260 - 8);
    expect(state.y).toBe(400);
    expect(onSettle).toHaveBeenCalledTimes(1);
    expect(controller.isThrowing()).toBe(false);
  });

  it('速度够快：逐帧滑行、阻尼衰减到阈值后落位持久化并清定时器', () => {
    const { controller, timers, onSettle } = makeController();
    const { win, state } = makeWindow({ x: 300, y: 400 });

    controller.start(win, { x: 1000, y: 0 });
    expect(timers.set).toHaveBeenCalledTimes(1);
    expect(controller.isThrowing()).toBe(true);

    for (let i = 0; i < 200 && controller.isThrowing(); i += 1) timers.tick();

    expect(state.x).toBeGreaterThan(300); // 确实向右滑了
    expect(onSettle).toHaveBeenCalledTimes(1);
    expect(timers.clear).toHaveBeenCalled();
    expect(controller.isThrowing()).toBe(false);
  });

  it('滑行中把窗口约束进工作区（不会飞出屏幕）', () => {
    const { controller, timers } = makeController();
    const { win, state } = makeWindow({ x: 20, y: 400 });

    controller.start(win, { x: -9000, y: 0 }); // 向左极速甩
    timers.tick();

    expect(state.x).toBe(8); // 夹到左边界（PET_EDGE_MARGIN=8）
    controller.stop();
  });

  it('stop 清理定时器；已销毁窗口不启动滑行', () => {
    const { controller, timers } = makeController();
    const { win } = makeWindow({ x: 300, y: 400 });

    controller.start(win, { x: 1000, y: 0 });
    controller.stop();
    expect(timers.clear).toHaveBeenCalled();
    expect(controller.isThrowing()).toBe(false);

    const { win: destroyed } = makeWindow({ x: 300, y: 400 }, true);
    controller.start(destroyed, { x: 1000, y: 0 });
    expect(timers.set).toHaveBeenCalledTimes(1); // 仅第一次真正起了定时器
  });

  it('工作区不可判定：安全停止并落位', () => {
    const { controller, timers, onSettle } = makeController({ getWorkArea: () => null as unknown as Rect });
    const { win } = makeWindow({ x: 300, y: 400 });

    controller.start(win, { x: 1000, y: 0 });
    timers.tick();

    expect(controller.isThrowing()).toBe(false);
    expect(onSettle).toHaveBeenCalledTimes(1);
  });

  it('帧间隔约 60fps', () => {
    expect(THROW_FRAME_MS).toBe(16);
  });
});
