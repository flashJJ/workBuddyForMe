import { describe, expect, it } from 'vitest';
import { sceneSchema, type Scene } from '@wbfm/shared/schemas';
import { ScriptDirector, type CueSink, type ScriptContext } from '../director';

/** P8.6：180 秒长剧本仍按单时钟推进，末尾 beat 之前不结束场景。 */
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

describe('ScriptDirector 长剧本', () => {
  it('180 秒场景在时间轴末尾才执行最后一条并结束', () => {
    const scene: Scene = sceneSchema.parse({
      id: 'long',
      priority: 1,
      beats: [
        { at: 0, cue: { kind: 'gesture', gesture: 'nod' } },
        { at: 60_000, cue: { kind: 'gesture', gesture: 'tilt' } },
        { at: 120_000, cue: { kind: 'gesture', gesture: 'glanceLeft' } },
        { at: 180_000, cue: { kind: 'gesture', gesture: 'glanceRight' } },
      ],
    });
    const executed: string[] = [];
    const ended: string[] = [];
    const sink: CueSink = {
      execute: (entry) => executed.push(`${entry.beatAt}`),
      end: (sceneId) => ended.push(sceneId),
    };
    const director = new ScriptDirector({ scenes: [scene], sink });

    expect(director.play('long', ctx())).toBe(true);
    director.update(179_999);
    expect(executed).toEqual(['0', '60000', '120000']);
    expect(ended).toEqual([]);

    director.update(1);
    expect(executed).toEqual(['0', '60000', '120000', '180000']);
    expect(ended).toEqual(['long']);
  });
});
