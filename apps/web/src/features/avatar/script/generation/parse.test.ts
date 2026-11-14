import { describe, expect, it } from 'vitest';
import { parseGeneratedScene } from './parse';

const VALID = {
  id: 'gen.tea-hello',
  triggers: ['touch::body::tap'],
  priority: 2,
  cooldownMs: 180_000,
  interrupt: 'all',
  beats: [
    { at: 0, cue: { kind: 'look', target: 'camera' } },
    { at: 0, cue: { kind: 'expression', tag: 'joy', holdMs: 3000 } },
    { at: 0, cue: { kind: 'line', pool: 'head-tap' } },
    { at: 8000, cue: { kind: 'wait', ms: 2000 } },
    { at: 12000, cue: { kind: 'motion', motion: 'motion.stance-sway' } },
    { at: 18000, cue: { kind: 'prop', prop: 'teacup', action: 'attach' } },
    { at: 26000, cue: { kind: 'line', pool: 'ambient' } },
    { at: 42000, cue: { kind: 'wait', ms: 2500 } },
    { at: 52000, cue: { kind: 'prop', prop: 'teacup', action: 'detach' } },
    { at: 64000, cue: { kind: 'gesture', gesture: 'nod', intensity: 0.5 } },
    { at: 78000, cue: { kind: 'line', pool: 'work-rest' } },
    { at: 90000, cue: { kind: 'look', target: 'camera' } },
  ],
};

function clone(patch: Record<string, unknown> = {}): unknown {
  return { ...VALID, ...patch, beats: VALID.beats };
}

function withBeat(patch: Record<string, unknown>, index = 0): unknown {
  const beats = VALID.beats.map((beat, i) => (i === index ? { ...beat, ...patch } : beat));
  return { ...VALID, beats };
}

describe('生成场景解析（P8.3）', () => {
  it('合法 JSON 保留，代码围栏也能解析', () => {
    const parsed = parseGeneratedScene('```json\n' + JSON.stringify(VALID) + '\n```');
    expect(parsed.issues).toEqual([]);
    expect(parsed.scene?.id).toBe('gen.tea-hello');
  });

  it('非 JSON / 未知原语 / 未知触发键一律拒绝', () => {
    expect(parseGeneratedScene('不是 JSON').scene).toBeNull();
    expect(parseGeneratedScene(JSON.stringify(clone({ triggers: ['touch::missing::tap'] }))).scene).toBeNull();
    expect(
      parseGeneratedScene(JSON.stringify(withBeat({ cue: { kind: 'behavior', behavior: 'x' } }))).scene,
    ).toBeNull();
  });

  it('拒绝带状态的 pose / behavior / VRMA / 未接线 cue', () => {
    expect(
      parseGeneratedScene(JSON.stringify(withBeat({ cue: { kind: 'pose', preset: 'sleep' } }))).scene,
    ).toBeNull();
    expect(
      parseGeneratedScene(
        JSON.stringify(withBeat({ cue: { kind: 'behavior', behavior: 'behavior.lifted' } })),
      ).scene,
    ).toBeNull();
    expect(
      parseGeneratedScene(
        JSON.stringify(withBeat({ cue: { kind: 'motion', motion: 'motion:wave.vrma' } })),
      ).scene,
    ).toBeNull();
    expect(
      parseGeneratedScene(JSON.stringify(withBeat({ cue: { kind: 'speak', text: 'hi' } }))).scene,
    ).toBeNull();
  });

  it('道具必须成对，且至少一句台词', () => {
    const unpaired = {
      ...VALID,
      beats: VALID.beats.filter((beat) => beat.cue.kind !== 'prop' || beat.cue.action !== 'detach'),
    };
    expect(parseGeneratedScene(JSON.stringify(unpaired)).scene).toBeNull();

    const noLine = {
      ...VALID,
      beats: VALID.beats.filter((beat) => beat.cue.kind !== 'line'),
    };
    expect(parseGeneratedScene(JSON.stringify(noLine)).scene).toBeNull();
  });

  it('节奏上下限：beat 太少、时长不足/过长、冷却过短都拒绝', () => {
    const few = { ...VALID, beats: VALID.beats.slice(0, 7) };
    expect(parseGeneratedScene(JSON.stringify(few)).scene).toBeNull();

    const short = {
      ...VALID,
      beats: VALID.beats.map((beat) => ({ ...beat, at: Math.min(beat.at, 50_000) })),
    };
    expect(parseGeneratedScene(JSON.stringify(short)).issues.join('')).toContain('不能早于');

    const long = withBeat({ at: 200_000 }, VALID.beats.length - 1);
    expect(parseGeneratedScene(JSON.stringify(long)).scene).toBeNull();

    const shortCooldown = clone({ cooldownMs: 60_000 });
    expect(parseGeneratedScene(JSON.stringify(shortCooldown)).issues.join('')).toContain('cooldownMs');
  });

  it('P8.6：wait 可用于场内战停顿', () => {
    expect(VALID.beats.some((beat) => beat.cue.kind === 'wait')).toBe(true);
    const parsed = parseGeneratedScene(JSON.stringify(VALID));
    expect(parsed.issues).toEqual([]);
    expect(parsed.scene?.beats).toHaveLength(12);
  });

  it('P8.4：接受 { story, scene } 包装并保留剧情元信息', () => {
    const wrapped = JSON.stringify({
      story: {
        title: '茶凉了',
        theme: '喝茶等待',
        tags: ['茶', '等待', '茶'],
        cliffhanger: '茶杯凉了还没喝',
      },
      scene: VALID,
    });
    const parsed = parseGeneratedScene(wrapped);
    expect(parsed.scene?.id).toBe('gen.tea-hello');
    expect(parsed.story).toMatchObject({
      title: '茶凉了',
      theme: '喝茶等待',
      cliffhanger: '茶杯凉了还没喝',
    });
    expect(parsed.story?.tags).toEqual(['茶', '等待']);
  });

  it('P8.4：cliffhanger 与 resolves 只能二选一；非法 story 拒绝', () => {
    const both = JSON.stringify({
      story: { title: 'x', theme: 'x', tags: ['a'], cliffhanger: 'a', resolves: 'b' },
      scene: VALID,
    });
    expect(parseGeneratedScene(both).scene).toBeNull();
    expect(parseGeneratedScene(both).issues.join('')).toContain('二选一');

    const bad = JSON.stringify({ story: { title: '' }, scene: VALID });
    expect(parseGeneratedScene(bad).scene).toBeNull();
  });

  it('阶段 3：弱偏好非法时只丢弃提示，不影响场次校验', () => {
    const invalid = JSON.stringify({
      story: { title: '夜读', theme: '夜读陪伴', tags: ['书页'], moods: 'bad', hours: 'bad' },
      scene: VALID,
    });
    const parsed = parseGeneratedScene(invalid);
    expect(parsed.scene?.id).toBe('gen.tea-hello');
    expect(parsed.story?.moods).toBeUndefined();
    expect(parsed.story?.hours).toBeUndefined();

    const valid = JSON.stringify({
      story: {
        title: '夜读',
        theme: '夜读陪伴',
        tags: ['书页'],
        moods: ['low'],
        hours: [{ from: 21, to: 23 }],
      },
      scene: VALID,
    });
    expect(parseGeneratedScene(valid).story?.moods).toEqual(['low']);
  });
});
