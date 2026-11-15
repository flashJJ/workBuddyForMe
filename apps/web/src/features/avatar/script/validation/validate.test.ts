import { describe, expect, it } from 'vitest';
import { BEAT_MAX_MS, type Beat, type Cue, type Scene } from '@wbfm/shared/schemas';
import { validateScene, validateScenes } from './validate';

function scene(id: string, beats: Beat[]): Scene {
  return { id, triggers: [], priority: 2, cooldownMs: 0, interrupt: 'all', beats };
}

function cue(value: unknown): Cue {
  return value as Cue;
}

describe('剧本白名单校验（P8.1 前置）', () => {
  it('保留已注册原语，剔除未知 pose/behavior/motion/pool/prop', () => {
    const result = validateScene(
      scene('test.scene', [
        { at: 0, cue: cue({ kind: 'behavior', behavior: 'behavior.bow' }) },
        { at: 0, cue: cue({ kind: 'pose', preset: 'stand' }) },
        { at: 0, cue: cue({ kind: 'prop', prop: 'teacup', action: 'attach' }) },
        { at: 1, cue: cue({ kind: 'behavior', behavior: 'behavior.missing' }) },
        { at: 2, cue: cue({ kind: 'motion', motion: 'motion.missing' }) },
        { at: 3, cue: cue({ kind: 'line', pool: 'missing-pool' }) },
        { at: 4, cue: cue({ kind: 'prop', prop: 'table', action: 'attach' }) },
      ]),
    );

    expect(result.scene.beats).toHaveLength(3);
    expect(result.dropped).toHaveLength(4);
    expect(result.dropped.join('\n')).toContain('behavior.missing');
    expect(result.dropped.join('\n')).toContain('道具动作与类型不匹配');
  });

  it('内部 motion 与 VRMA motion: 区分', () => {
    const result = validateScene(
      scene('test.scene', [
        { at: 0, cue: cue({ kind: 'motion', motion: 'motion.wave' }) },
        { at: 0, cue: cue({ kind: 'motion', motion: 'motion:foo.vrma' }) },
        { at: 0, cue: cue({ kind: 'motion', motion: 'motion:' }) },
      ]),
    );
    expect(result.scene.beats).toHaveLength(2);
    expect(result.dropped).toHaveLength(1);
  });

  it('branch 递归清洗；全空时整条丢弃', () => {
    const partial = validateScene(
      scene('test.scene', [
        {
          at: 0,
          cue: cue({
            kind: 'branch',
            if: { flag: 'busy' },
            then: [{ kind: 'behavior', behavior: 'behavior.missing' }],
            else: [{ kind: 'wait', ms: 10 }],
          }),
        },
      ]),
    );
    const branch = partial.scene.beats[0]?.cue;
    expect(branch?.kind).toBe('branch');
    if (branch?.kind === 'branch') {
      expect(branch.then).toHaveLength(0);
      expect(branch.else).toHaveLength(1);
    }

    const empty = validateScene(
      scene('test.scene', [
        {
          at: 0,
          cue: cue({
            kind: 'branch',
            if: { flag: 'busy' },
            then: [{ kind: 'behavior', behavior: 'behavior.missing' }],
          }),
        },
      ]),
    );
    expect(empty.scene.beats).toHaveLength(0);
    expect(empty.dropped.join('\n')).toContain('branch 无合法 cue');
  });

  it('validateScenes 汇总所有场景的丢弃原因', () => {
    const result = validateScenes([
      scene('a', [{ at: 0, cue: cue({ kind: 'behavior', behavior: 'behavior.missing' }) }]),
      scene('b', [{ at: 0, cue: cue({ kind: 'wait', ms: 10 }) }]),
    ]);
    expect(result.scenes.map((item) => item.id)).toEqual(['a', 'b']);
    // a：非法 behavior + 清洗后无合法 beat 两条原因；b 的 wait 合法
    expect(result.dropped).toHaveLength(2);
    expect(result.dropped.join('\n')).toContain('behavior.missing');
    expect(result.dropped.join('\n')).toContain('a: 无合法 beat');
  });

  it('Gate：合法原语全部保留，非法原语 100% 拦截', () => {
    const valid: Cue[] = [
      { kind: 'pose', preset: 'squash' },
      { kind: 'gesture', gesture: 'nod' },
      { kind: 'motion', motion: 'motion.wave' },
      { kind: 'behavior', behavior: 'behavior.bow' },
      { kind: 'prop', prop: 'teacup', action: 'attach' },
      { kind: 'expression', tag: 'joy', holdMs: 1000 },
      { kind: 'look', target: 'camera', weight: 0.5 },
      { kind: 'line', pool: 'head-tap' },
      { kind: 'speak', text: '早安' },
      { kind: 'wait', ms: 200 },
    ];
    const invalid: Cue[] = [
      cue({ kind: 'pose', preset: 'missing-pose' }),
      cue({ kind: 'gesture', gesture: 'missing-gesture' }),
      cue({ kind: 'motion', motion: 'motion.missing' }),
      cue({ kind: 'behavior', behavior: 'behavior.missing' }),
      cue({ kind: 'prop', prop: 'missing-prop', action: 'attach' }),
      cue({ kind: 'expression', tag: 'missing-expression' }),
      cue({ kind: 'look', target: 'missing-target' }),
      cue({ kind: 'line', pool: 'missing-pool' }),
      cue({ kind: 'speak', text: '   ' }),
      cue({ kind: 'wait', ms: -1 }),
    ];
    const result = validateScene(
      scene('gate.scene', [
        ...valid.map((item, index) => ({ at: index, cue: item })),
        ...invalid.map((item, index) => ({ at: valid.length + index, cue: item })),
      ]),
    );
    expect(result.scene.beats).toHaveLength(valid.length);
    expect(result.dropped).toHaveLength(invalid.length);
  });

  it('时间约束：乱序排序、beat 超界与时长/权重越界丢弃', () => {
    const result = validateScene(
      scene('timing.scene', [
        { at: 50, cue: cue({ kind: 'expression', tag: 'joy', holdMs: 60_001 }) },
        { at: 10, cue: cue({ kind: 'look', target: 'camera', weight: 1.5 }) },
        { at: 20, cue: cue({ kind: 'gesture', gesture: 'nod', intensity: -0.1 }) },
        { at: 30, cue: cue({ kind: 'line', pool: 'head-tap', ms: 60_001 }) },
        { at: BEAT_MAX_MS + 1, cue: cue({ kind: 'look', target: 'camera' }) },
        { at: 40, cue: cue({ kind: 'wait', ms: 600_001 }) },
        { at: 60, cue: cue({ kind: 'look', target: 'camera' }) },
      ]),
    );

    expect(result.scene.beats).toHaveLength(1);
    expect(result.scene.beats[0]?.at).toBe(60);
    const reasons = result.dropped.join('\n');
    expect(reasons).toContain('beats 乱序');
    expect(reasons).toContain('expression holdMs');
    expect(reasons).toContain('look weight');
    expect(reasons).toContain('gesture intensity');
    expect(reasons).toContain('line ms');
    expect(reasons).toContain('beat at');
    expect(reasons).toContain('wait ms');
  });

  it('清洗后没有合法 beat 时记录原因', () => {
    const result = validateScene(
      scene('empty.scene', [
        { at: 0, cue: cue({ kind: 'behavior', behavior: 'behavior.missing' }) },
      ]),
    );
    expect(result.scene.beats).toHaveLength(0);
    expect(result.dropped.join('\n')).toContain('无合法 beat');
  });
});
