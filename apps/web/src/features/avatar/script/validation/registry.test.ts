import { describe, expect, it } from 'vitest';
import { SCRIPT_PRIMITIVES, createScriptPrimitiveSets } from './registry';

describe('剧本原语注册表（P8.1）', () => {
  it('覆盖生成器需要的全部原语类别', () => {
    expect(SCRIPT_PRIMITIVES.poses).toContain('pose.idle-body');
    expect(SCRIPT_PRIMITIVES.posePresets).toContain('squash');
    expect(SCRIPT_PRIMITIVES.motions).toContain('motion.wave');
    expect(SCRIPT_PRIMITIVES.behaviors).toContain('behavior.bow');
    expect(SCRIPT_PRIMITIVES.expressions).toContain('joy');
    expect(SCRIPT_PRIMITIVES.gestures).toContain('nod');
    expect(SCRIPT_PRIMITIVES.lookTargets).toContain('camera');
    expect(SCRIPT_PRIMITIVES.linePools).toContain('head-tap');
    expect(SCRIPT_PRIMITIVES.props).toContainEqual({ id: 'teacup', kind: 'hand' });
    expect(SCRIPT_PRIMITIVES.props).toContainEqual({ id: 'table', kind: 'stage' });
  });

  it('集合视图可追加自定义 pose 预设，并保留道具类型', () => {
    const sets = createScriptPrimitiveSets(['custom-preset']);
    expect(sets.presets.has('custom-preset')).toBe(true);
    expect(sets.presets.has('squash')).toBe(true);
    expect(sets.poses.has('pose.idle-body')).toBe(true);
    expect(sets.props.get('teacup')).toBe('hand');
    expect(sets.props.get('table')).toBe('stage');
  });
});
