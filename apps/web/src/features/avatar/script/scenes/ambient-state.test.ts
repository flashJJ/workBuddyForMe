import { describe, expect, it } from 'vitest';
import { ScriptDirector, type CueLogEntry, type CueSink, type ScriptContext } from '../director';
import { BUILT_IN_SCENE_REGISTRY, BUILT_IN_SCENES } from '../scenes';

function ctx(over: Partial<ScriptContext> = {}): ScriptContext {
  return {
    hour: 12,
    relationshipLevel: 'partner',
    mood: 'normal',
    emotionEnabled: true,
    linesEnabled: true,
    doNotDisturb: { enabled: true, startHour: 23, endHour: 6 },
    busy: false,
    sleeping: false,
    faceAway: false,
    random: () => 0.5,
    ...over,
  };
}

function makeDirector(): { director: ScriptDirector; executed: CueLogEntry[] } {
  const executed: CueLogEntry[] = [];
  const sink: CueSink = { execute: (entry) => executed.push(entry) };
  return { director: new ScriptDirector({ scenes: BUILT_IN_SCENES, sink }), executed };
}

describe('环境场景（低语 / 环顾 / 换重心）', () => {
  it('注册表可查，低语保持 ambient 池 3600ms', () => {
    for (const id of ['ambient.whisper', 'ambient.glance', 'ambient.shift-weight']) {
      expect(BUILT_IN_SCENE_REGISTRY.get(id)).not.toBeNull();
    }
    expect(BUILT_IN_SCENE_REGISTRY.get('ambient.whisper')?.beats[0]?.cue).toEqual({
      kind: 'line',
      pool: 'ambient',
      ms: 3600,
    });
  });

  it('忙碌 / 睡眠 / 背对时环境场景被门控拒绝', () => {
    const { director } = makeDirector();
    expect(director.play('ambient.whisper', ctx({ busy: true }))).toBe(false);
    expect(director.play('ambient.whisper', ctx({ sleeping: true }))).toBe(false);
    expect(director.play('ambient.whisper', ctx({ faceAway: true }))).toBe(false);
  });

  it('关闭台词时场景仍可播，但 voice 被抑制', () => {
    const { director, executed } = makeDirector();
    expect(director.play('ambient.whisper', ctx({ linesEnabled: false }))).toBe(true);
    expect(executed).toEqual([]);
  });

  it('环顾是 look 轨道，不占用 body', () => {
    const { director, executed } = makeDirector();
    expect(director.play('ambient.glance', ctx())).toBe(true);
    expect(executed.map((entry) => entry.track)).toEqual(['look']);
  });
});

describe('状态场景（睡眠 / 唤醒 / 背对 / 转回）', () => {
  it('状态场景优先级 1 且不可被抢占', () => {
    for (const id of ['state.sleep', 'state.wake', 'state.face-away', 'state.face-front']) {
      expect(BUILT_IN_SCENE_REGISTRY.get(id)?.priority).toBe(1);
      expect(BUILT_IN_SCENE_REGISTRY.get(id)?.interrupt).toBe('never');
    }
  });

  it('睡眠 / 背对状态不被自身状态门控挡住', () => {
    const sleeping = makeDirector();
    expect(sleeping.director.play('state.sleep', ctx({ sleeping: true }))).toBe(true);
    expect(sleeping.executed[0]?.cue).toEqual({ kind: 'pose', preset: 'sleep' });
    expect(sleeping.executed[0]?.track).toBe('body');

    const away = makeDirector();
    expect(away.director.play('state.face-away', ctx({ faceAway: true }))).toBe(true);
    expect(away.executed[0]?.cue).toEqual({ kind: 'pose', preset: 'face-away' });

    const front = makeDirector();
    expect(front.director.play('state.face-front', ctx({ faceAway: true }))).toBe(true);
    expect(front.executed[0]?.cue).toEqual({ kind: 'pose', preset: 'face-front' });
  });

  it('唤醒场景在睡眠中也能播放', () => {
    const { director, executed } = makeDirector();
    expect(director.play('state.wake', ctx({ sleeping: true }))).toBe(true);
    expect(executed[0]?.cue).toEqual({ kind: 'pose', preset: 'wake' });
  });
});
