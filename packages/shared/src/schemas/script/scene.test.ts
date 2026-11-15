import { describe, expect, it } from 'vitest';
import { presetSchema, resolvePreset } from './presets';
import { BEAT_MAX_MS, sceneSchema } from './scene';

const minimalScene = {
  id: 'ambient.whisper',
  beats: [{ at: 0, cue: { kind: 'line', pool: 'ambient' } }],
} as const;

describe('sceneSchema（Scene / Beat 契约）', () => {
  it('最小场景应用缺省值', () => {
    const scene = sceneSchema.parse(minimalScene);
    expect(scene.priority).toBe(2);
    expect(scene.cooldownMs).toBe(0);
    expect(scene.interrupt).toBe('all');
    expect(scene.triggers).toEqual([]);
    expect(scene.gating).toBeUndefined();
  });

  it('完整场景解析：触发键 / 门控 / 抢占 / 多 beat', () => {
    const scene = sceneSchema.parse({
      id: 'touch.head-tap',
      triggers: ['touch::head::tap'],
      priority: 1,
      cooldownMs: 500,
      interrupt: 'never',
      gating: { all: [{ level: { min: 'acquaintance' } }, { not: { flag: 'sleeping' } }] },
      beats: [
        { at: 0, cue: { kind: 'motion', motion: 'motion:wave.vrma' } },
        { at: 120, cue: { kind: 'expression', tag: 'joy', holdMs: 1200 } },
        { at: 300, cue: { kind: 'branch', if: { flag: 'busy' }, then: [] } },
      ],
    });
    expect(scene.triggers).toEqual(['touch::head::tap']);
    expect(scene.priority).toBe(1);
    expect(scene.interrupt).toBe('never');
    expect(scene.beats).toHaveLength(3);
  });

  it('拒绝非法字段与空时间轴', () => {
    expect(sceneSchema.safeParse({ ...minimalScene, priority: 4 }).success).toBe(false);
    expect(sceneSchema.safeParse({ ...minimalScene, priority: -1 }).success).toBe(false);
    expect(sceneSchema.safeParse({ ...minimalScene, interrupt: 'ambient' }).success).toBe(false);
    expect(sceneSchema.safeParse({ ...minimalScene, cooldownMs: -1 }).success).toBe(false);
    expect(sceneSchema.safeParse({ id: '', beats: minimalScene.beats }).success).toBe(false);
    expect(sceneSchema.safeParse({ id: 'x', beats: [] }).success).toBe(false);
    expect(
      sceneSchema.safeParse({ id: 'x', beats: [{ at: -1, cue: { kind: 'wait', ms: 0 } }] }).success,
    ).toBe(false);
    expect(
      sceneSchema.safeParse({
        id: 'x',
        beats: [{ at: BEAT_MAX_MS + 1, cue: { kind: 'wait', ms: 0 } }],
      }).success,
    ).toBe(false);
  });

  it('beats 必须按 at 升序（错误路径指向 beats.<i>.at）', () => {
    const result = sceneSchema.safeParse({
      id: 'x',
      beats: [
        { at: 200, cue: { kind: 'wait', ms: 0 } },
        { at: 100, cue: { kind: 'wait', ms: 0 } },
      ],
    });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.issues[0]?.path).toEqual(['beats', 1, 'at']);
  });
});

describe('presetSchema / resolvePreset（Preset 契约）', () => {
  const preset = presetSchema.parse({
    id: 'pose.wave',
    beats: [{ at: 0, cue: { kind: 'gesture', gesture: 'tilt' } }],
  });

  it('按 id 解析，未命中返回 null', () => {
    expect(resolvePreset([preset], 'pose.wave')).toBe(preset);
    expect(resolvePreset([preset], 'pose.none')).toBeNull();
  });

  it('preset 的 beat 同样要求非空与升序', () => {
    expect(presetSchema.safeParse({ id: 'p', beats: [] }).success).toBe(false);
    expect(
      presetSchema.safeParse({
        id: 'p',
        beats: [
          { at: 5, cue: { kind: 'wait', ms: 0 } },
          { at: 1, cue: { kind: 'wait', ms: 0 } },
        ],
      }).success,
    ).toBe(false);
  });
});
