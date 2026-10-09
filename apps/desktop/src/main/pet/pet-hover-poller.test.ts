import { afterEach, describe, expect, it, vi } from 'vitest';
import { PetHoverPoller, type PetHoverWindow } from './pet-hover-poller';
import { PetClickThroughController } from './pet-penetration';

/**
 * v1.1 M2：从 pet-manager.test「主进程光标轮询」用例迁移。
 * 接真实 PetClickThroughController 复刻穿透断言（移入立即关穿透、移出滞回
 * 不立即翻转），命中盒 321,432,260×340 与原用例一致。
 */
function createFakeWindow(): { win: PetHoverWindow; setIgnore: ReturnType<typeof vi.fn> } {
  const moveHandlers: Array<() => void> = [];
  const setIgnore = vi.fn();
  const win: PetHoverWindow = {
    isDestroyed: vi.fn(() => false),
    isMinimized: vi.fn(() => false),
    isVisible: vi.fn(() => true),
    getBounds: vi.fn(() => ({ x: 321, y: 432, width: 260, height: 340 })),
    on: vi.fn((event: 'move', cb: () => void) => {
      if (event === 'move') moveHandlers.push(cb);
    }),
  };
  return {
    win: Object.assign(win, { emitMove: () => moveHandlers.forEach((cb) => cb()) }),
    setIgnore,
  };
}

describe('PetHoverPoller（全局光标悬停轮询）', () => {
  afterEach(() => vi.clearAllMocks());

  it('移入命中盒立即关穿透，移出经滞回本 tick 不立即翻转', () => {
    const { win, setIgnore } = createFakeWindow();
    let pollTick: () => void = () => undefined;
    let cursor = { x: 0, y: 0 }; // 初始在窗口外
    const controller = new PetClickThroughController({
      setPenetrating: (p) => setIgnore(p, { forward: p }),
    });
    controller.start(); // 与 manager 装配一致：先初始化穿透态（true）
    setIgnore.mockClear();
    new PetHoverPoller({
      getCursor: () => cursor,
      setInterval: (cb: () => void) => {
        pollTick = cb;
        return 1 as unknown as ReturnType<typeof setInterval>;
      },
      clearInterval: vi.fn(),
      onHover: (h) => controller.update(h),
      onForceInteractive: () => controller.force(false),
    }).start(win);

    // 光标在外首 tick：已穿透态无计时，controller 不重复下发
    pollTick();
    expect(setIgnore).not.toHaveBeenCalled();

    // 光标移到窗口命中列中央
    cursor = { x: 451, y: 600 };
    pollTick();
    expect(setIgnore).toHaveBeenLastCalledWith(false, { forward: false });

    // 移出：本轮不翻转（滞回 180ms，真实定时器下尚未到期）
    cursor = { x: 10, y: 10 };
    pollTick();
    expect(setIgnore).toHaveBeenLastCalledWith(false, { forward: false });
  });

  it('窗口最小化/隐藏时 tick 不翻转穿透', () => {
    const { win, setIgnore } = createFakeWindow();
    let pollTick: () => void = () => undefined;
    (win.isMinimized as ReturnType<typeof vi.fn>).mockReturnValue(true);
    const controller = new PetClickThroughController({
      setPenetrating: (p) => setIgnore(p, { forward: p }),
    });
    controller.start();
    setIgnore.mockClear();
    new PetHoverPoller({
      getCursor: () => ({ x: 451, y: 600 }), // 即使光标在盒内
      setInterval: (cb: () => void) => {
        pollTick = cb;
        return 1 as unknown as ReturnType<typeof setInterval>;
      },
      clearInterval: vi.fn(),
      onHover: (h) => controller.update(h),
      onForceInteractive: () => controller.force(false),
    }).start(win);
    pollTick();
    expect(setIgnore).not.toHaveBeenCalled(); // 最小化：既不上报也不翻转
  });

  it('系统拖拽 move 事件：刷新宽限窗并强制可交互，宽限内 tick 不上报悬停', () => {
    const { win } = createFakeWindow();
    let pollTick: () => void = () => undefined;
    let cursor = { x: 451, y: 600 }; // 在盒内
    const force = vi.fn();
    const onHover = vi.fn();
    new PetHoverPoller({
      getCursor: () => cursor,
      setInterval: (cb: () => void) => {
        pollTick = cb;
        return 1 as unknown as ReturnType<typeof setInterval>;
      },
      clearInterval: vi.fn(),
      onHover,
      onForceInteractive: () => force(false),
    }).start(win);
    onHover.mockClear(); // start 内首次 tick 已上报一次

    // 拖拽中光标滑出命中盒：move 触发强制可交互；宽限窗内 tick 不上报悬停
    cursor = { x: 10, y: 10 };
    (win as unknown as { emitMove(): void }).emitMove();
    expect(force).toHaveBeenCalledWith(false);
    pollTick();
    expect(onHover).not.toHaveBeenCalled();
  });

  it('stop 清理定时器后不再 tick', () => {
    const { win } = createFakeWindow();
    const clearInterval = vi.fn();
    const timer = 42 as unknown as ReturnType<typeof setInterval>;
    const poller = new PetHoverPoller({
      getCursor: () => ({ x: 0, y: 0 }),
      setInterval: () => timer,
      clearInterval,
      onHover: vi.fn(),
      onForceInteractive: vi.fn(),
    });
    poller.start(win);
    poller.stop();
    expect(clearInterval).toHaveBeenCalledWith(timer);
    poller.stop(); // 幂等：不重复清理
    expect(clearInterval).toHaveBeenCalledTimes(1);
  });
});
