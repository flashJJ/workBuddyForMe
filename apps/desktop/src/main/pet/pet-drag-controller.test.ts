import { describe, expect, it, vi } from 'vitest';
import { PetDragController, type PetDragWindow } from './pet-drag-controller';

/**
 * v1.1 M2：从 pet-manager.test「手动拖拽」用例迁移，断言数值一行不改
 * （偏移 130,168；窗口定位 370,532 / 380,542；3px 手势阈值）。
 */
function createFakeWindow(): {
  win: PetDragWindow;
  setPosition: ReturnType<typeof vi.fn>;
} {
  const setPosition = vi.fn();
  const win: PetDragWindow = {
    isDestroyed: vi.fn(() => false),
    getBounds: vi.fn(() => ({ x: 321, y: 432, width: 260, height: 340 })),
    setPosition,
  };
  return { win, setPosition };
}

describe('PetDragController（DIP 手势拖拽）', () => {
  it('begin 记录偏移，dragTo 按全局坐标移窗，end 达阈值才持久化', () => {
    const { win, setPosition } = createFakeWindow();
    let cursor = { x: 451, y: 600 };
    const onDragEnd = vi.fn();
    const drag = new PetDragController({ getCursor: () => cursor, now: () => 1000, onDragEnd });

    // begin 时光标在 (451,600)，bounds 原点 (321,432) → 偏移 (130,168)
    drag.begin(win);
    expect(drag.isDragging()).toBe(true);

    // 光标未移动超过阈值（3px）→ 不 setPosition（视为点击）
    drag.dragTo(win);
    expect(setPosition).not.toHaveBeenCalled();

    // 光标移到 (500,700)，超阈值 → 窗口左上 = (500-130, 700-168)
    cursor = { x: 500, y: 700 };
    drag.dragTo(win);
    expect(setPosition).toHaveBeenLastCalledWith(370, 532);
    expect(setPosition).toHaveBeenCalledTimes(1);

    // 继续移动 → (510-130, 710-168)
    cursor = { x: 510, y: 710 };
    drag.dragTo(win);
    expect(setPosition).toHaveBeenLastCalledWith(380, 542);

    // end：位移达阈值 → 回调持久化（无时钟注入 → 采样同刻，速度 0）
    drag.end(win);
    expect(onDragEnd).toHaveBeenCalledTimes(1);
    expect(onDragEnd).toHaveBeenCalledWith(win, { x: 0, y: 0 });
    expect(drag.isDragging()).toBe(false);
  });

  it('释放速度：按采样窗口内位移/时长计算（注入时钟）', () => {
    const { win } = createFakeWindow();
    let t = 1000;
    let cursor = { x: 100, y: 100 };
    const onDragEnd = vi.fn();
    const drag = new PetDragController({ getCursor: () => cursor, now: () => t, onDragEnd });

    drag.begin(win); // 采样 (100,100)@1000
    t = 1016;
    cursor = { x: 140, y: 100 };
    drag.dragTo(win); // 采样 (140,100)@1016
    t = 1032;
    cursor = { x: 180, y: 100 };
    drag.dragTo(win); // 采样 (180,100)@1032
    t = 1040; // 距最后采样 8ms（<=80 未过期）
    drag.end(win);

    // 窗口内首末 (100,100)@1000 → (180,100)@1032：dx=80 / 32ms → 2500 DIP/s
    expect(onDragEnd).toHaveBeenCalledWith(win, { x: 2500, y: 0 });
  });

  it('松手前已停住：最后一个采样过期 → 速度 0（不算抛掷）', () => {
    const { win } = createFakeWindow();
    let t = 1000;
    let cursor = { x: 100, y: 100 };
    const onDragEnd = vi.fn();
    const drag = new PetDragController({ getCursor: () => cursor, now: () => t, onDragEnd });

    drag.begin(win);
    t = 1100;
    cursor = { x: 300, y: 100 };
    drag.dragTo(win); // 采样 (300,100)@1100
    t = 1300; // 距最后采样 200ms > 80ms → 视为已停住
    drag.end(win);

    expect(onDragEnd).toHaveBeenCalledWith(win, { x: 0, y: 0 });
  });

  it('位移未达 3px 阈值：end 不回调持久化（点击 tap 语义）', () => {
    const { win, setPosition } = createFakeWindow();
    let cursor = { x: 100, y: 100 };
    const onDragEnd = vi.fn();
    const drag = new PetDragController({ getCursor: () => cursor, onDragEnd });

    drag.begin(win);
    cursor = { x: 101, y: 101 }; // 曼哈顿距离 2 < 3
    drag.dragTo(win);
    expect(setPosition).not.toHaveBeenCalled();
    drag.end(win);
    expect(onDragEnd).not.toHaveBeenCalled();
  });

  it('拖拽开始时回调 onDragStart（manager 据此强制可交互）', () => {
    const { win } = createFakeWindow();
    const onDragStart = vi.fn();
    const drag = new PetDragController({ getCursor: () => ({ x: 0, y: 0 }), onDragStart });
    drag.begin(win);
    expect(onDragStart).toHaveBeenCalledTimes(1);
  });

  it('窗口已销毁/为空：begin/dragTo/end 全部安全空转', () => {
    const destroyed: PetDragWindow = {
      isDestroyed: () => true,
      getBounds: () => ({ x: 0, y: 0, width: 1, height: 1 }),
      setPosition: vi.fn(),
    };
    const onDragEnd = vi.fn();
    const drag = new PetDragController({ getCursor: () => ({ x: 0, y: 0 }), onDragEnd });
    drag.begin(null);
    drag.begin(destroyed);
    expect(drag.isDragging()).toBe(false);
    drag.dragTo(destroyed);
    drag.end(destroyed);
    expect(onDragEnd).not.toHaveBeenCalled();
  });
});
