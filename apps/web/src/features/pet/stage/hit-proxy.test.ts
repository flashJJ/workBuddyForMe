import { describe, expect, it } from 'vitest';
import { buildPetHitProxy, petBackgroundHitRect } from './hit-proxy';

describe('buildPetHitProxy（模型包围盒 → 命中轮廓）', () => {
  const viewport = { width: 260, height: 340 };

  it('归一化到窗口坐标，点数在契约上限内', () => {
    const proxy = buildPetHitProxy({ x: 26, y: 34, width: 208, height: 306 }, viewport);
    expect(proxy?.version).toBe(1);
    expect(proxy?.polygons[0]?.id).toBe('body');
    const points = proxy!.polygons[0]!.points;
    expect(points.length).toBeGreaterThanOrEqual(3);
    expect(points.length).toBeLessThanOrEqual(32);
    for (const [x, y] of points) {
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThanOrEqual(1);
      expect(y).toBeGreaterThanOrEqual(0);
      expect(y).toBeLessThanOrEqual(1);
    }
  });

  it('轮廓比矩形更贴合：四角被切掉', () => {
    const proxy = buildPetHitProxy({ x: 0, y: 0, width: 260, height: 340 }, viewport);
    const points = proxy!.polygons[0]!.points;
    // 非矩形：顶点数 > 4 且不含 (0,0)/(1,0) 这类整窗角点
    expect(points.length).toBeGreaterThan(4);
    expect(points).not.toContainEqual([0, 0]);
    expect(points).not.toContainEqual([1, 0]);
    expect(points).not.toContainEqual([1, 1]);
    expect(points).not.toContainEqual([0, 1]);
  });

  it('多个 UI 面板都并入命中轮廓（动效菜单 + 剧本面板互不覆盖）', () => {
    const proxy = buildPetHitProxy({ x: 26, y: 34, width: 208, height: 306 }, viewport, [
      { x: 4, y: 300, width: 120, height: 32 },
      { x: 190, y: 4, width: 64, height: 40 },
    ]);
    expect(proxy?.polygons.map((polygon) => polygon.id)).toEqual(['body', 'ui', 'ui']);
  });

  it('越界包围盒夹紧到 0..1；退化尺寸返回 null', () => {
    const proxy = buildPetHitProxy({ x: -50, y: -20, width: 400, height: 400 }, viewport);
    expect(proxy).not.toBeNull();
    for (const [x, y] of proxy!.polygons[0]!.points) {
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThanOrEqual(1);
      expect(y).toBeGreaterThanOrEqual(0);
      expect(y).toBeLessThanOrEqual(1);
    }
    expect(buildPetHitProxy({ x: 0, y: 0, width: 0, height: 0 }, viewport)).toBeNull();
    expect(buildPetHitProxy({ x: 0, y: 0, width: 1, height: 1 }, { width: 0, height: 0 })).toBeNull();
    expect(buildPetHitProxy({ x: 0, y: 0, width: 2, height: 200 }, viewport)).toBeNull();
  });

  it('有背景时整张画框并入命中区：无模型轮廓也能覆盖角色上方空白（B-65）', () => {
    const rect = petBackgroundHitRect(viewport, 7);
    expect(rect).toEqual({ x: 7, y: 7, width: viewport.width - 14, height: viewport.height - 14 });
    const proxy = buildPetHitProxy(null, viewport, rect);
    expect(proxy?.polygons.map((polygon) => polygon.id)).toEqual(['ui']);
    const [left, top] = proxy!.polygons[0]!.points[0]!;
    // 画框顶部与左侧都从 7px 开始，覆盖角色上方的可见背景
    expect(left).toBeLessThan(0.1);
    expect(top).toBeLessThan(0.05);
  });

  it('背景命中矩形在退化视口下返回 null', () => {
    expect(petBackgroundHitRect({ width: 10, height: 10 }, 7)).toBeNull();
  });
});
