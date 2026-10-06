import { describe, expect, it, vi, beforeEach } from 'vitest';
import { PetClickThroughController } from './pet-penetration';

/** 手工驱动的虚拟定时器，不等待真实时间 */
function createFakeTimers() {
  let seq = 1;
  const pending = new Map<number, () => void>();
  return {
    setTimer: vi.fn((cb: () => void) => {
      const id = seq++ as unknown as ReturnType<typeof setTimeout>;
      pending.set(id as unknown as number, cb);
      return id;
    }),
    clearTimer: vi.fn((id: ReturnType<typeof setTimeout>) => {
      pending.delete(id as unknown as number);
    }),
    runOne() {
      const [id, cb] = [...pending.entries()][0] ?? [];
      if (id === undefined || !cb) return false;
      pending.delete(id);
      cb();
      return true;
    },
    pendingCount: () => pending.size,
  };
}

describe('PetClickThroughController 滞回穿透', () => {
  let fake: ReturnType<typeof createFakeTimers>;
  let setPenetrating: ReturnType<typeof vi.fn>;
  let controller: PetClickThroughController;

  beforeEach(() => {
    fake = createFakeTimers();
    setPenetrating = vi.fn();
    controller = new PetClickThroughController({
      setPenetrating,
      setTimer: fake.setTimer as never,
      clearTimer: fake.clearTimer as never,
      leaveDelayMs: 180,
    });
  });

  it('start 后默认穿透', () => {
    controller.start();
    expect(setPenetrating).toHaveBeenLastCalledWith(true);
    expect(controller.isPenetrating()).toBe(true);
  });

  it('进入命中区立即关闭穿透（不经过延时）', () => {
    controller.start();
    controller.update(true);
    expect(setPenetrating).toHaveBeenLastCalledWith(false);
    expect(fake.pendingCount()).toBe(0);
  });

  it('离开命中区不立即穿透：先安排计时，计时到期才穿透', () => {
    controller.start();
    controller.update(true);
    controller.update(false);
    expect(controller.isPenetrating()).toBe(false);
    expect(fake.pendingCount()).toBe(1);
    expect(setPenetrating).not.toHaveBeenLastCalledWith(true);

    expect(fake.runOne()).toBe(true);
    expect(controller.isPenetrating()).toBe(true);
    expect(setPenetrating).toHaveBeenLastCalledWith(true);
  });

  it('离开后的延时窗口内重新进入：取消失探，保持可交互（边缘抖动不翻转）', () => {
    controller.start();
    controller.update(true);
    controller.update(false);
    expect(fake.pendingCount()).toBe(1);
    controller.update(true);
    expect(fake.pendingCount()).toBe(0);
    expect(fake.clearTimer).toHaveBeenCalled();
    expect(controller.isPenetrating()).toBe(false);
  });

  it('持续在外围不重复创建计时器', () => {
    controller.start();
    controller.update(false);
    controller.update(false);
    expect(fake.setTimer).not.toHaveBeenCalled();
  });

  it('交互态连续在命中区内移动不重复下发状态', () => {
    controller.start();
    controller.update(true);
    controller.update(true);
    controller.update(true);
    expect(fake.setTimer).not.toHaveBeenCalled();
    // 仅 start(true) + 一次 false
    expect(setPenetrating.mock.calls.filter((c) => c[0] === false)).toHaveLength(1);
  });

  it('force 手动切换并清掉待执行计时', () => {
    controller.start();
    controller.update(true);
    controller.update(false);
    controller.force(true);
    expect(fake.pendingCount()).toBe(0);
    expect(controller.isPenetrating()).toBe(true);
  });

  it('dispose 清理计时器且不触发穿透回调', () => {
    controller.start();
    controller.update(true);
    controller.update(false);
    controller.dispose();
    expect(fake.pendingCount()).toBe(0);
  });
});
