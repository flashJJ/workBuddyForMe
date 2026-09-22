import { describe, expect, it } from 'vitest';
import { resolveRenderScale } from './pdf-render';

describe('resolveRenderScale（视觉 OCR 像素预算）', () => {
  it('无像素上限：原样返回请求缩放', () => {
    expect(resolveRenderScale(595, 842, 2)).toBe(2);
    expect(resolveRenderScale(595, 842, 2, 0)).toBe(2);
  });

  it('A4 基准 595×842 在 2x 下约 200 万像素：基本不缩回且不超预算', () => {
    // 595*842*4 = 2,003,960，仅略超 200 万 → 微缩到预算内
    const scale = resolveRenderScale(595, 842, 2, 2_000_000);
    expect(scale).toBeGreaterThan(1.99);
    expect(595 * scale * 842 * scale).toBeLessThanOrEqual(2_000_000);
  });

  it('超大画幅页：等比缩回使总像素不超过预算', () => {
    // 1240×1754×2² ≈ 870 万像素，预算 200 万
    const scale = resolveRenderScale(1240, 1754, 2, 2_000_000);
    expect(scale).toBeLessThan(2);
    const scaledPixels = 1240 * scale * 1754 * scale;
    expect(scaledPixels).toBeLessThanOrEqual(2_000_000);
    // 等比缩回，不应过度缩小（预算利用 ≥ 99%）
    expect(scaledPixels).toBeGreaterThan(1_980_000);
  });

  it('基准像素异常（0）时安全回退请求缩放', () => {
    expect(resolveRenderScale(0, 0, 3, 2_000_000)).toBe(3);
  });
});
