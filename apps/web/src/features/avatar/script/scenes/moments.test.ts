import { describe, expect, it } from 'vitest';
import type { Cue } from '@wbfm/shared/schemas';
import { ScriptDirector, type CueLogEntry, type CueSink, type ScriptContext } from '../director';
import { BUILT_IN_SCENE_REGISTRY, BUILT_IN_SCENES } from '../scenes';

function ctx(over: Partial<ScriptContext> = {}): ScriptContext {
  return {
    hour: 14,
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

function setup() {
  const executed: CueLogEntry[] = [];
  const ended: string[] = [];
  const sink: CueSink = {
    execute: (entry) => executed.push(entry),
    end: (sceneId) => ended.push(sceneId),
  };
  return { executed, ended, director: new ScriptDirector({ scenes: BUILT_IN_SCENES, sink }) };
}

function behaviors(entries: readonly CueLogEntry[]): string[] {
  return entries
    .map((entry) => entry.cue)
    .filter((cue): cue is Extract<Cue, { kind: 'behavior' }> => cue.kind === 'behavior')
    .map((cue) => cue.behavior);
}

function presets(entries: readonly CueLogEntry[]): string[] {
  return entries
    .map((entry) => entry.cue)
    .filter((cue): cue is Extract<Cue, { kind: 'pose' }> => cue.kind === 'pose')
    .map((cue) => cue.preset);
}

describe('P3 日常场戏', () => {
  it('干饭：行为 + 表情入场，4s 后结束并回站姿', () => {
    const { director, executed, ended } = setup();
    expect(director.play('moment.eat-rice', ctx())).toBe(true);
    expect(behaviors(executed)).toEqual(['behavior.eat-rice']);
    expect(executed.some((entry) => entry.cue.kind === 'expression')).toBe(true);
    expect(
      executed.some((entry) => entry.cue.kind === 'line' && entry.cue.pool === 'eat-rice'),
    ).toBe(true);

    director.update(3000);
    expect(ended).toEqual([]);
    director.update(1000);
    expect(ended).toEqual(['moment.eat-rice']);
  });

  it('工作提醒：伏案 2.4s 后切伸懒腰，5.4s 结束', () => {
    const { director, executed, ended } = setup();
    expect(director.play('moment.work-rest', ctx())).toBe(true);
    expect(behaviors(executed)).toEqual(['behavior.work-focus']);

    director.update(2500);
    expect(behaviors(executed)).toEqual(['behavior.work-focus', 'behavior.wake']);
    expect(
      executed.some((entry) => entry.cue.kind === 'line' && entry.cue.pool === 'work-rest'),
    ).toBe(true);
    expect(ended).toEqual([]);

    director.update(3000);
    expect(ended).toEqual(['moment.work-rest']);
  });

  it('被叫胖：3s 内保持生气行为，随后结束', () => {
    const { director, executed, ended } = setup();
    expect(director.play('moment.called-fat', ctx())).toBe(true);
    expect(behaviors(executed)).toEqual(['behavior.scold-fat']);
    expect(
      executed.some((entry) => entry.cue.kind === 'line' && entry.cue.pool === 'called-fat'),
    ).toBe(true);
    director.update(3100);
    expect(ended).toEqual(['moment.called-fat']);
  });

  it('坐窗沿：0s 进坐姿，6s 起身回站姿并结束', () => {
    const { director, executed, ended } = setup();
    expect(director.play('moment.sit-sill', ctx())).toBe(true);
    expect(presets(executed)).toEqual(['sit-sill']);
    expect(executed.some((entry) => entry.cue.kind === 'expression')).toBe(true);

    director.update(5900);
    expect(ended).toEqual([]);
    director.update(100);
    expect(presets(executed)).toEqual(['sit-sill', 'stand']);
    expect(ended).toEqual(['moment.sit-sill']);
  });

  it('喝茶：attach 茶杯，3.2s 后 detach 并结束', () => {
    const { director, executed, ended } = setup();
    expect(director.play('moment.tea', ctx())).toBe(true);
    const propActions = () =>
      executed
        .map((entry) => entry.cue)
        .filter((cue): cue is Extract<Cue, { kind: 'prop' }> => cue.kind === 'prop')
        .map((cue) => `${cue.prop}:${cue.action}`);
    expect(propActions()).toEqual(['teacup:attach', 'table:show']);

    director.update(3100);
    expect(ended).toEqual([]);
    director.update(100);
    expect(propActions()).toEqual([
      'teacup:attach',
      'table:show',
      'teacup:detach',
      'table:hide',
    ]);
    expect(ended).toEqual(['moment.tea']);
  });

  it('update(0) 冻结：只执行起点 cue，不推进', () => {
    const { director, executed, ended } = setup();
    expect(director.play('moment.called-fat', ctx())).toBe(true);
    const before = executed.length;
    director.update(0);
    expect(executed).toHaveLength(before);
    expect(ended).toEqual([]);
  });

  it('冷却：场景结束后同场景在冷却内被拒', () => {
    const { director } = setup();
    expect(director.play('moment.eat-rice', ctx())).toBe(true);
    director.update(4000);
    expect(director.play('moment.eat-rice', ctx())).toBe(false);
  });

  it('打断：cancel 结束场景并通知 sink', () => {
    const { director, ended } = setup();
    expect(director.play('moment.work-rest', ctx())).toBe(true);
    director.cancel('voice');
    expect(ended).toEqual(['moment.work-rest']);
  });
});

describe('P3 场戏触发键', () => {
  it('工作提醒接 workStreak；干饭/被叫胖暂无触发键', () => {
    expect(BUILT_IN_SCENE_REGISTRY.byTrigger('context::workStreak').map((s) => s.id)).toEqual([
      'moment.work-rest',
    ]);
    expect(BUILT_IN_SCENE_REGISTRY.get('moment.eat-rice')?.triggers).toEqual([]);
    expect(BUILT_IN_SCENE_REGISTRY.get('moment.called-fat')?.triggers).toEqual([]);
  });

  it('触摸场戏接 behavior.head-pat，且不再发 pose:tap', () => {
    const { director, executed } = setup();
    expect(director.play('touch.head-tap', ctx())).toBe(true);
    expect(behaviors(executed)).toEqual(['behavior.head-pat']);
    expect(
      executed.some((entry) => entry.cue.kind === 'pose' && entry.cue.preset === 'tap'),
    ).toBe(false);

    director.update(2800);
    expect(executed.some((entry) => entry.cue.kind === 'look')).toBe(true);
  });
});
