import { describe, expect, it } from 'vitest';
import { sceneSchema, type Scene } from '@wbfm/shared/schemas';
import {
  ScriptDirector,
  type CueLogEntry,
  type CueSink,
  type SceneEndReason,
  type ScriptContext,
} from './director';
import { deriveSeed, mulberry32, sceneRandom } from './random';

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

function makeScene(id: string, over: Record<string, unknown> = {}): Scene {
  return sceneSchema.parse({
    id,
    beats: [{ at: 0, cue: { kind: 'gesture', gesture: 'nod' } }],
    ...over,
  });
}

function createSink(): {
  sink: CueSink;
  executed: Array<{ entry: CueLogEntry; random: () => number }>;
  ended: Array<[string, SceneEndReason]>;
} {
  const executed: Array<{ entry: CueLogEntry; random: () => number }> = [];
  const ended: Array<[string, SceneEndReason]> = [];
  return {
    executed,
    ended,
    sink: {
      execute: (entry, random) => executed.push({ entry, random }),
      end: (sceneId, reason) => ended.push([sceneId, reason]),
    },
  };
}

/** 持续 1s 的 body 场景（两条 beat，避免 play 即结束） */
function heldScene(id: string, over: Record<string, unknown> = {}): Scene {
  return makeScene(id, {
    beats: [
      { at: 0, cue: { kind: 'gesture', gesture: 'nod' } },
      { at: 1000, cue: { kind: 'gesture', gesture: 'tilt' } },
    ],
    ...over,
  });
}

describe('random（确定性随机）', () => {
  it('mulberry32 同 seed 同序列，输出落在 [0,1)', () => {
    const a = mulberry32(42);
    const b = mulberry32(42);
    for (let i = 0; i < 8; i += 1) {
      const value = a();
      expect(value).toBe(b());
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
  });

  it('deriveSeed 对 sceneId / playIndex 敏感', () => {
    const base = deriveSeed(7, 'scene.a', 0);
    expect(deriveSeed(7, 'scene.a', 0)).toBe(base);
    expect(deriveSeed(7, 'scene.a', 1)).not.toBe(base);
    expect(deriveSeed(7, 'scene.b', 0)).not.toBe(base);
    expect(deriveSeed(8, 'scene.a', 0)).not.toBe(base);
  });

  it('sceneRandom 同三元组可重放', () => {
    const a = sceneRandom(3, 'scene.x', 2);
    const b = sceneRandom(3, 'scene.x', 2);
    expect([a(), a(), a()]).toEqual([b(), b(), b()]);
  });
});

describe('ScriptDirector（轨道 / 抢占 / 队列）', () => {
  it('低优先级不能抢占；高优先级抢占并通知 fadeOut，被抢占不恢复', () => {
    const { sink, executed, ended } = createSink();
    const slow = heldScene('slow', { priority: 1 });
    const ambient = makeScene('ambient', { priority: 2 });
    const urgent = makeScene('urgent', { priority: 0 });
    const director = new ScriptDirector({ scenes: [slow, ambient, urgent], sink });

    expect(director.play('slow', ctx())).toBe(true);
    expect(director.play('ambient', ctx())).toBe(false);
    expect(director.play('urgent', ctx())).toBe(true);

    expect(ended).toContainEqual(['slow', 'preempt']);
    expect(executed.map(({ entry }) => entry.sceneId)).toEqual(['slow', 'urgent']);

    // 被抢占的 slow 不恢复：推进 1s 后不应再出现 slow 的第二条 beat
    director.update(1000);
    expect(executed.filter(({ entry }) => entry.sceneId === 'slow')).toHaveLength(1);
  });

  it('interrupt: never 的场景不可被抢占', () => {
    const { sink } = createSink();
    const landing = heldScene('landing', { priority: 2, interrupt: 'never' });
    const touch = makeScene('touch', { priority: 0 });
    const director = new ScriptDirector({ scenes: [landing, touch], sink });

    expect(director.play('landing', ctx())).toBe(true);
    expect(director.play('touch', ctx())).toBe(false);
  });

  it('同优先级不抢占，进队列并在当前场景结束后启动', () => {
    const { sink, executed, ended } = createSink();
    const first = heldScene('first', { priority: 1 });
    const second = heldScene('second', { priority: 1 });
    const director = new ScriptDirector({ scenes: [first, second], sink });

    expect(director.play('first', ctx())).toBe(true);
    expect(director.play('second', ctx())).toBe(true);
    expect(executed.map(({ entry }) => entry.sceneId)).toEqual(['first']);

    director.update(1000);
    expect(ended).toEqual([['first', 'complete']]);
    expect(executed.map(({ entry }) => entry.sceneId)).toEqual(['first', 'first', 'second']);
  });

  it('drag 不取消 P0，但会取消触摸级', () => {
    const { sink, executed } = createSink();
    const urgent = heldScene('urgent', { priority: 0 });
    const touch = heldScene('touch', { priority: 1 });
    const director = new ScriptDirector({ scenes: [urgent, touch], sink });

    expect(director.play('urgent', ctx())).toBe(true);
    director.cancel('drag');
    director.update(1000);
    expect(executed.filter(({ entry }) => entry.sceneId === 'urgent')).toHaveLength(2);

    expect(director.play('touch', ctx())).toBe(true);
    director.cancel('drag');
    director.update(1000);
    expect(executed.filter(({ entry }) => entry.sceneId === 'touch')).toHaveLength(1);
  });
});

describe('ScriptDirector（冷却 / 连续播放限制 / 门控）', () => {
  it('冷却按单时钟计时；同一 scene 连续最多 2 次', () => {
    const { sink } = createSink();
    const tap = makeScene('tap', { priority: 1, cooldownMs: 1000 });
    const other = makeScene('other', { priority: 1 });
    const director = new ScriptDirector({ scenes: [tap, other], sink });

    expect(director.play('tap', ctx())).toBe(true);
    expect(director.play('tap', ctx())).toBe(false); // 冷却
    director.update(1000);
    expect(director.play('tap', ctx())).toBe(true); // 第二次
    expect(director.play('tap', ctx())).toBe(false); // 冷却
    director.update(1000);
    expect(director.play('tap', ctx())).toBe(false); // 连续第 3 次

    expect(director.play('other', ctx())).toBe(true); // 打断连续计数
    expect(director.play('tap', ctx())).toBe(true);
  });

  it('busy / sleeping / faceAway 只挡环境级（P2/P3）', () => {
    const { sink } = createSink();
    const ambient = makeScene('ambient', { priority: 2 });
    const touch = makeScene('touch', { priority: 1 });
    const director = new ScriptDirector({ scenes: [ambient, touch], sink });

    expect(director.play('ambient', ctx({ busy: true }))).toBe(false);
    expect(director.play('ambient', ctx({ sleeping: true }))).toBe(false);
    expect(director.play('ambient', ctx({ faceAway: true }))).toBe(false);
    expect(director.play('touch', ctx({ busy: true, sleeping: true }))).toBe(true);
  });

  it('gating 条件不满足时拒绝播放', () => {
    const { sink } = createSink();
    const gated = makeScene('gated', { priority: 1, gating: { level: { min: 'partner' } } });
    const director = new ScriptDirector({ scenes: [gated], sink });

    expect(director.play('gated', ctx({ relationshipLevel: 'acquaintance' }))).toBe(false);
    expect(director.play('gated', ctx({ relationshipLevel: 'partner' }))).toBe(true);
  });

  it('未知场景返回 false', () => {
    const { sink } = createSink();
    const director = new ScriptDirector({ scenes: [], sink });
    expect(director.play('missing', ctx())).toBe(false);
  });
});

describe('ScriptDirector（确定性 / 条件 / 时钟）', () => {
  const rngScene = makeScene('rng', {
    priority: 1,
    beats: [
      { at: 0, cue: { kind: 'line', pool: 'ambient' } },
      { at: 0, cue: { kind: 'line', pool: 'ambient' } },
    ],
  });

  function runRandom(seed: number): number[] {
    const { sink, executed } = createSink();
    const director = new ScriptDirector({ scenes: [rngScene], sink, seed });
    director.play('rng', ctx());
    return executed.flatMap(({ random }) => [random(), random()]);
  }

  it('同 seed 重放得到同一随机序列，不同 seed 不同', () => {
    expect(runRandom(7)).toEqual(runRandom(7));
    expect(runRandom(7)).not.toEqual(runRandom(8));
  });

  it('branch 在 play 时刻按条件选边', () => {
    const branchScene = makeScene('branch', {
      priority: 1,
      beats: [
        {
          at: 0,
          cue: {
            kind: 'branch',
            if: { flag: 'busy' },
            then: [{ kind: 'gesture', gesture: 'nod' }],
            else: [{ kind: 'gesture', gesture: 'tilt' }],
          },
        },
      ],
    });
    const busyRun = createSink();
    const busyDirector = new ScriptDirector({ scenes: [branchScene], sink: busyRun.sink });
    busyDirector.play('branch', ctx({ busy: true }));
    expect((busyRun.executed[0]?.entry.cue as { gesture?: string }).gesture).toBe('nod');

    const idleRun = createSink();
    const idleDirector = new ScriptDirector({ scenes: [branchScene], sink: idleRun.sink });
    idleDirector.play('branch', ctx({ busy: false }));
    expect((idleRun.executed[0]?.entry.cue as { gesture?: string }).gesture).toBe('tilt');
  });

  it('update(0) 冻结；dt 累计后按 beatAt 依次触发', () => {
    const { sink, executed } = createSink();
    const scene = makeScene('timed', {
      priority: 1,
      beats: [{ at: 100, cue: { kind: 'gesture', gesture: 'nod' } }],
    });
    const director = new ScriptDirector({ scenes: [scene], sink });
    expect(director.play('timed', ctx())).toBe(true);
    director.update(0);
    director.update(99);
    expect(executed).toHaveLength(0);
    director.update(1);
    expect(executed).toHaveLength(1);
    expect(executed[0]?.entry.beatAt).toBe(100);
  });

  it('勿扰与关闭台词只抑制 voice 轨道', () => {
    const { sink, executed } = createSink();
    const scene = makeScene('voice', {
      priority: 1,
      beats: [
        { at: 0, cue: { kind: 'line', pool: 'ambient' } },
        { at: 0, cue: { kind: 'gesture', gesture: 'nod' } },
      ],
    });
    const dnd = new ScriptDirector({ scenes: [scene], sink });
    expect(dnd.play('voice', ctx({ hour: 23 }))).toBe(true);
    expect(executed.map(({ entry }) => entry.track)).toEqual(['body']);

    const mutedRun = createSink();
    const muted = new ScriptDirector({ scenes: [scene], sink: mutedRun.sink });
    expect(muted.play('voice', ctx({ linesEnabled: false }))).toBe(true);
    expect(mutedRun.executed.map(({ entry }) => entry.track)).toEqual(['body']);
  });
});
