import { describe, expect, it } from 'vitest';
import { PROPS, PROP_IDS } from './prop-manifest';

describe('道具 manifest（S2/S4）', () => {
  it('手持与场景道具均已登记', () => {
    expect(PROP_IDS).toEqual([
      'teacup',
      'bowl',
      'book',
      'table',
      'phone',
      'flower',
      'cushion',
      'lamp',
    ]);
    expect(PROPS.teacup?.animation).toBe('pour');
    expect(PROPS.book?.animation).toBe('flip');
    expect(PROPS.table?.animation).toBeUndefined();
    expect(PROPS.phone?.kind).toBe('hand');
    expect(PROPS.lamp?.kind).toBe('stage');
  });

  it('id、路径、许可与握持/摆放参数合法', () => {
    for (const [id, spec] of Object.entries(PROPS)) {
      expect(spec.id).toBe(id);
      expect(spec.url).toMatch(/^\/props\/.+\.glb$/);
      expect(['CC0-1.0', 'CC-BY-4.0']).toContain(spec.license);
      if (spec.kind === 'hand') {
        expect(spec.contact).toBeGreaterThan(0);
        expect(spec.lateral).toBeGreaterThanOrEqual(0);
        expect(spec.handPose).toBe('pose.prop-hold');
      } else {
        expect(spec.position).toHaveLength(3);
        expect(spec.handPose).toBeUndefined();
      }
    }
  });
});
