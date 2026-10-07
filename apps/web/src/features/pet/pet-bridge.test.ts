// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { isPetBodyPoint, isPetHitPoint, readPetModelId } from './pet-bridge';

describe('pet 命中盒纯函数（窗口 260×340）', () => {
  const W = 260;
  const H = 340;

  it('命中列内为 true，左右外围/顶部带为 false', () => {
    // 中央
    expect(isPetHitPoint(130, 200, W, H)).toBe(true);
    // 左/右外围
    expect(isPetHitPoint(10, 200, W, H)).toBe(false);
    expect(isPetHitPoint(255, 200, W, H)).toBe(false);
    // 顶部 11% 留白带
    expect(isPetHitPoint(130, 20, W, H)).toBe(false);
    // 底边内
    expect(isPetHitPoint(130, 336, W, H)).toBe(true);
  });

  it('身体区与头部 tap 区分界（下 62%）', () => {
    // y=250 在下 62% 区（340*0.38≈129 以上才是头；250 属身体）
    expect(isPetBodyPoint(130, 250, W, H)).toBe(true);
    // 头部区
    expect(isPetBodyPoint(130, 80, W, H)).toBe(false);
    expect(isPetHitPoint(130, 80, W, H)).toBe(true);
    // 身体区外（左外围）
    expect(isPetBodyPoint(5, 300, W, H)).toBe(false);
  });

  it('非正尺寸安全返回 false', () => {
    expect(isPetHitPoint(10, 10, 0, 0)).toBe(false);
  });
});

describe('readPetModelId', () => {
  afterEach(() => {
    window.history.replaceState(null, '', '/');
  });

  it('从 query 读 model', () => {
    window.history.replaceState(null, '', '/pet?model=wanko');
    expect(readPetModelId()).toBe('wanko');
  });

  it('无 model 参数返回 null（注册表侧回落 haru）', () => {
    window.history.replaceState(null, '', '/pet');
    expect(readPetModelId()).toBeNull();
  });
});
