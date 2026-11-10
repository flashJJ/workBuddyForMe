import { describe, expect, it } from 'vitest';
import { cueSchema, isM0IgnoredCue, type Cue } from './cues';
import { cueTrack } from './scene';

function cueOf(value: unknown): Cue {
  const result = cueSchema.safeParse(value);
  // 测试夹具非法时直接抛出行路径，便于定位
  if (!result.success) throw new Error(JSON.stringify(result.error.issues));
  return result.data;
}

describe('cueSchema（Cue 契约）', () => {
  it('M0 九类 cue 均可解析，且推导到正确轨道', () => {
    const cues: Array<[unknown, Cue['kind'], string | null]> = [
      [{ kind: 'pose', preset: 'pose.wave', fadeMs: 200 }, 'pose', 'body'],
      [{ kind: 'gesture', gesture: 'nod', intensity: 0.6 }, 'gesture', 'body'],
      [{ kind: 'motion', motion: 'motion:wave.vrma', loop: false }, 'motion', 'body'],
      [{ kind: 'expression', tag: 'joy', holdMs: 1200 }, 'expression', 'face'],
      [{ kind: 'look', target: 'camera', weight: 0.8 }, 'look', 'look'],
      [{ kind: 'line', pool: 'head-tap', ms: 2600 }, 'line', 'voice'],
      [{ kind: 'speak', text: '欢迎回来' }, 'speak', 'voice'],
      [{ kind: 'wait', ms: 120 }, 'wait', null],
      [
        { kind: 'branch', if: { flag: 'busy' }, then: [{ kind: 'wait', ms: 0 }] },
        'branch',
        null,
      ],
    ];
    for (const [input, kind, track] of cues) {
      const cue = cueOf(input);
      expect(cue.kind).toBe(kind);
      expect(cueTrack(cue)).toBe(track);
    }
  });

  it('保留 cue 可解析且 M0 标记为忽略', () => {
    const reserved: Cue[] = [
      cueOf({ kind: 'sound', sound: 'chime', volume: 0.5 }),
      cueOf({ kind: 'effect', effect: 'sparkle', params: { count: 3 } }),
      cueOf({ kind: 'move', target: 'random', durationMs: 800 }),
      cueOf({ kind: 'emit', event: 'script.done', payload: { ok: true } }),
    ];
    for (const cue of reserved) expect(isM0IgnoredCue(cue)).toBe(true);
    expect(isM0IgnoredCue(cueOf({ kind: 'wait', ms: 10 }))).toBe(false);
  });

  it('branch 递归嵌套（含条件与 else）', () => {
    const cue = cueOf({
      kind: 'branch',
      if: { all: [{ level: { min: 'partner' } }, { not: { flag: 'sleeping' } }] },
      then: [
        {
          kind: 'branch',
          if: { mood: ['good', 'normal'] },
          then: [{ kind: 'speak', pool: 'cheer' }],
          else: [{ kind: 'expression', tag: 'sadness' }],
        },
      ],
      else: [{ kind: 'line', pool: 'ambient' }],
    });
    expect(cue.kind).toBe('branch');
    if (cue.kind === 'branch') {
      expect(cue.then[0]?.kind).toBe('branch');
      expect(cue.else?.[0]?.kind).toBe('line');
    }
  });

  it('拒绝非法参数并给出错误路径', () => {
    expect(cueSchema.safeParse({ kind: 'dance' }).success).toBe(false);
    expect(cueSchema.safeParse({ kind: 'wait', ms: -1 }).success).toBe(false);
    expect(cueSchema.safeParse({ kind: 'gesture', gesture: 'wave' }).success).toBe(false);
    expect(cueSchema.safeParse({ kind: 'expression', tag: 'happy' }).success).toBe(false);
    expect(cueSchema.safeParse({ kind: 'look', target: 'left' }).success).toBe(false);
    expect(cueSchema.safeParse({ kind: 'line', pool: 'unknown-pool' }).success).toBe(false);
    expect(cueSchema.safeParse({ kind: 'speak', text: 42 }).success).toBe(false);
    expect(cueSchema.safeParse({ kind: 'motion', motion: '   ' }).success).toBe(false);
    expect(cueSchema.safeParse({ kind: 'gesture', gesture: 'tilt', intensity: 2 }).success).toBe(
      false,
    );

    const nested = cueSchema.safeParse({
      kind: 'branch',
      if: { flag: 'busy' },
      then: [{ kind: 'wait', ms: 'soon' }],
    });
    expect(nested.success).toBe(false);
    if (!nested.success) expect(nested.error.issues[0]?.path).toEqual(['then', 0, 'ms']);
  });
});
