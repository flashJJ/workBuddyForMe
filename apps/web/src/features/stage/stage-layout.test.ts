import { describe, expect, it } from 'vitest';
import type { StageScenePayload, StageSlot } from '@wbfm/shared/schemas';
import {
  ACTOR_BASE_HEIGHT_RATIO,
  NON_FOCUS_FILTER,
  clampActorScale,
  clampRatio,
  clampSceneZoom,
  computeActorLayout,
  DEFAULT_SLOT_PLACEMENTS,
  resolvePlacement,
} from './stage-layout';
import { defaultScenePayload } from './stage-defaults';

function payload(over: Partial<StageScenePayload> = {}): StageScenePayload {
  return { ...defaultScenePayload(), ...over };
}

describe('v1.9 舞台布局纯函数', () => {
  it('默认站位：中槽居中略高、左右对称靠侧', () => {
    const left = resolvePlacement('left', payload());
    const right = resolvePlacement('right', payload());
    expect(left.x).toBe(DEFAULT_SLOT_PLACEMENTS.left.x);
    expect(right.x).toBe(1 - DEFAULT_SLOT_PLACEMENTS.left.x);
    expect(DEFAULT_SLOT_PLACEMENTS.center.x).toBe(0.5);
  });

  it('场景 slots 覆盖优先生效，缺省回落默认', () => {
    const p = payload({ slots: { center: { x: 0.6, y: 0.5, scale: 1.2 } } });
    expect(resolvePlacement('center', p).x).toBe(0.6);
    expect(resolvePlacement('left', p).x).toBe(DEFAULT_SLOT_PLACEMENTS.left.x);
  });

  it('聚焦槽放大 1.12 且无滤镜；非聚焦槽降饱和；zIndex 聚焦最前', () => {
    const p = payload();
    const focused = computeActorLayout('center', p, 'center');
    const other = computeActorLayout('left', p, 'center');
    expect(focused.focused).toBe(true);
    expect(focused.filter).toBe('none');
    expect(focused.zIndex).toBeGreaterThan(other.zIndex);
    expect(other.filter).toBe(NON_FOCUS_FILTER);
    // 高度差即聚焦系数 1.12
    expect(focused.heightVh / other.heightVh).toBeCloseTo(1.12 / (other.scale / focused.scale) * 1, 0);
    expect(focused.heightVh).toBeCloseTo(ACTOR_BASE_HEIGHT_RATIO * 100 * 1.12, 5);
  });

  it('散焦（focus=null）时全员同权、无滤镜', () => {
    const p = payload();
    for (const slot of ['left', 'center', 'right'] as StageSlot[]) {
      const layout = computeActorLayout(slot, p, null);
      expect(layout.filter).toBe('none');
      expect(layout.focused).toBe(false);
    }
  });

  it('sceneZoom 与槽位 scale 共同决定高度', () => {
    const p = payload({ sceneZoom: 1.2, slots: { left: { x: 0.2, y: 0.7, scale: 0.8 } } });
    const left = computeActorLayout('left', p, null);
    expect(left.heightVh).toBeCloseTo(ACTOR_BASE_HEIGHT_RATIO * 100 * 1.2 * 0.8, 5);
  });

  it('宽度恒为高度×固定宽高比', () => {
    const layout = computeActorLayout('center', payload(), 'center');
    expect(layout.widthVh / layout.heightVh).toBeCloseTo(0.56, 5);
  });

  it('clamp 系列夹紧越界值', () => {
    expect(clampActorScale(3)).toBe(1.6);
    expect(clampActorScale(0.1)).toBe(0.6);
    expect(clampSceneZoom(0.2)).toBe(0.7);
    expect(clampSceneZoom(2)).toBe(1.3);
    expect(clampRatio(-1)).toBe(0.05);
    expect(clampRatio(2)).toBe(0.95);
  });
});
