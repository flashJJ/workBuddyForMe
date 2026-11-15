import { describe, expect, it } from 'vitest';
import type { Cue } from '@wbfm/shared/schemas';
import { ScriptDirector, type CueLogEntry, type CueSink, type ScriptContext } from '../director';
import { BUILT_IN_SCENES } from '../scenes';
import { validateScene } from '../validation/validate';
import { POOL_SCENES } from './pool';

function ctx(): ScriptContext {
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
  };
}

function makeDirector(): {
  director: ScriptDirector;
  executed: CueLogEntry[];
  ended: string[];
} {
  const executed: CueLogEntry[] = [];
  const ended: string[] = [];
  const sink: CueSink = {
    execute: (entry) => executed.push(entry),
    end: (sceneId) => ended.push(sceneId),
  };
  return { director: new ScriptDirector({ scenes: BUILT_IN_SCENES, sink }), executed, ended };
}

function propActions(entries: readonly CueLogEntry[]): string[] {
  return entries
    .map((entry) => entry.cue)
    .filter((cue): cue is Extract<Cue, { kind: 'prop' }> => cue.kind === 'prop')
    .map((cue) => `${cue.prop}:${cue.action}`);
}

function hasCue(
  entries: readonly CueLogEntry[],
  kind: Cue['kind'],
  value?: string,
): boolean {
  return entries.some((entry) => {
    if (entry.cue.kind !== kind) return false;
    if (!value) return true;
    const cue = entry.cue as { behavior?: string; motion?: string };
    return cue.behavior === value || cue.motion === value;
  });
}

describe('P8.2 本地剧本池（3 条手写剧本）', () => {
  it('全部通过白名单与时间约束', () => {
    expect(POOL_SCENES).toHaveLength(3);
    for (const scene of POOL_SCENES) {
      const result = validateScene(scene);
      expect(result.dropped, scene.id).toEqual([]);
      expect(result.scene.beats).toHaveLength(scene.beats.length);
    }
  });

  it('三条剧本都能交给 Director 完整播完并结束', () => {
    const { director, executed, ended } = makeDirector();
    for (const scene of POOL_SCENES) {
      executed.length = 0;
      ended.length = 0;
      expect(director.play(scene.id, ctx()), scene.id).toBe(true);
      const duration = Math.max(...scene.beats.map((beat) => beat.at)) + 1;
      director.update(duration);
      expect(ended, scene.id).toEqual([scene.id]);
      expect(executed.length, scene.id).toBeGreaterThan(0);
    }
  });

  it('morning-tea：手持茶杯与场景桌子成对收起', () => {
    const { director, executed, ended } = makeDirector();
    expect(director.play('pool.morning-tea', ctx())).toBe(true);
    expect(propActions(executed)).toEqual(['teacup:attach', 'table:show']);
    director.update(6000);
    expect(propActions(executed)).toEqual([
      'teacup:attach',
      'table:show',
      'teacup:detach',
      'table:hide',
    ]);
    expect(ended).toEqual(['pool.morning-tea']);
  });

  it('reading-break：书架行为与台词共同推进', () => {
    const { director, executed } = makeDirector();
    expect(director.play('pool.reading-break', ctx())).toBe(true);
    expect(propActions(executed)).toEqual(['book:attach']);
    expect(hasCue(executed, 'behavior', 'behavior.work-focus')).toBe(true);
    director.update(6000);
    expect(propActions(executed)).toEqual(['book:attach', 'book:detach']);
  });

  it('desk-stretch：走剧本专用 motion（script:motion）', () => {
    const { director, executed, ended } = makeDirector();
    expect(director.play('pool.desk-stretch', ctx())).toBe(true);
    expect(hasCue(executed, 'motion', 'motion.stretch-up')).toBe(true);
    director.update(4000);
    expect(ended).toEqual(['pool.desk-stretch']);
  });
});
