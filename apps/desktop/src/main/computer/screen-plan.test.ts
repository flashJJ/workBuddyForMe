import { describe, expect, it } from 'vitest';
import { planSnapshot } from './screen-plan';

describe('planSnapshot（截图裁剪/缩放计划）', () => {
  it('小屏整屏：不裁剪不缩放，scaleFactor=1', () => {
    const plan = planSnapshot(1280, 720);
    expect(plan.crop).toBeUndefined();
    expect(plan.resize).toBeUndefined();
    expect(plan.scaleFactor).toBe(1);
  });

  it('大屏整屏：等比缩放到最大边 1568', () => {
    const plan = planSnapshot(3840, 2160);
    expect(plan.crop).toBeUndefined();
    expect(plan.scaleFactor).toBeCloseTo(1568 / 3840);
    expect(plan.resize).toEqual({ width: 1568, height: 882 });
  });

  it('竖向长边：以高度为基准缩放', () => {
    const plan = planSnapshot(1000, 4000);
    expect(plan.resize?.height).toBe(1568);
    expect(plan.resize?.width).toBe(Math.round(1000 * (1568 / 4000)));
  });

  it('region 合法：先裁剪，裁剪后小于最大边则不缩放', () => {
    const plan = planSnapshot(3840, 2160, { x: 100, y: 200, width: 800, height: 600 });
    expect(plan.crop).toEqual({ x: 100, y: 200, width: 800, height: 600 });
    expect(plan.resize).toBeUndefined();
    expect(plan.scaleFactor).toBe(1);
  });

  it('region 大于最大边：裁剪后再缩放', () => {
    const plan = planSnapshot(3840, 2160, { x: 0, y: 0, width: 3136, height: 2000 });
    expect(plan.crop).toEqual({ x: 0, y: 0, width: 3136, height: 2000 });
    expect(plan.resize?.width).toBe(1568);
    expect(plan.resize?.height).toBe(1000);
  });

  it('region 部分越界：夹紧到屏幕内', () => {
    const plan = planSnapshot(1920, 1080, { x: 1800, y: 1000, width: 500, height: 500 });
    expect(plan.crop).toEqual({ x: 1800, y: 1000, width: 120, height: 80 });
  });

  it('region 完全越界：抛错', () => {
    expect(() => planSnapshot(1920, 1080, { x: 5000, y: 0, width: 100, height: 100 })).toThrow(/超出屏幕范围/);
  });

  it('恰好等于最大边：不缩放', () => {
    const plan = planSnapshot(1568, 1000);
    expect(plan.resize).toBeUndefined();
    expect(plan.scaleFactor).toBe(1);
  });

  it('自定义 maxEdge 生效', () => {
    const plan = planSnapshot(2000, 1000, undefined, 500);
    expect(plan.resize).toEqual({ width: 500, height: 250 });
  });
});
