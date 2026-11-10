import { describe, expect, it } from 'vitest';
import {
  ACTION_CHAINS,
  type ActionChainId,
  type Cue,
} from '@wbfm/shared/schemas';
import { CueRecorder, type ObservedCue } from '../recorder';
import { ScriptDirector, type CueLogEntry, type CueSink, type ScriptContext } from '../director';
import { BUILT_IN_SCENE_REGISTRY, BUILT_IN_SCENES } from '../scenes';

/** 旧链与新场景共用的播放上下文（partner 通过两条 gating） */
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

/** 新场景 cue → 旧链观测单元；interaction 由指针层负责，不参与对比 */
function observeCue(cue: Cue): ObservedCue | null {
  switch (cue.kind) {
    case 'pose':
      if (cue.preset === 'squash') return { kind: 'squash' };
      if (cue.preset === 'tap') return { kind: 'tap' };
      return null;
    case 'expression':
      return cue.holdMs === 0
        ? { kind: 'expression', tag: cue.tag, flash: false }
        : { kind: 'expression', tag: cue.tag, flash: true, holdMs: cue.holdMs };
    case 'line':
      return { kind: 'line', pool: cue.pool, durationMs: cue.ms };
    default:
      return null;
  }
}

const PAIRS: ReadonlyArray<[ActionChainId, string]> = [
  ['head-tap', 'touch.head-tap'],
  ['head-longpress', 'touch.head-longpress'],
  ['body-tap', 'touch.body-tap'],
  ['body-longpress', 'touch.body-longpress'],
  ['body-double', 'touch.body-double'],
  ['raised-tap', 'touch.raised-tap'],
];

describe('6 条触摸链的 golden 等价', () => {
  for (const [chainId, sceneId] of PAIRS) {
    it(`${sceneId} ↔ ${chainId}`, () => {
      const recorder = new CueRecorder({ now: () => 0 });
      recorder.recordChain(ACTION_CHAINS[chainId]());
      const legacy = recorder.log
        .filter((entry) => entry.cue.kind !== 'interaction')
        .map((entry) => entry.cue);

      const executed: CueLogEntry[] = [];
      const sink: CueSink = { execute: (entry) => executed.push(entry) };
      const director = new ScriptDirector({ scenes: BUILT_IN_SCENES, sink });
      expect(director.play(sceneId, ctx())).toBe(true);

      const observed = executed
        .map((entry) => observeCue(entry.cue))
        .filter((cue): cue is ObservedCue => cue !== null);
      expect(observed).toEqual(legacy);
    });
  }
});

describe('内置场景注册表', () => {
  it('按 id 与触发键可查，触发键候选按优先级升序', () => {
    expect(BUILT_IN_SCENE_REGISTRY.list()).toHaveLength(13);
    expect(BUILT_IN_SCENE_REGISTRY.get('touch.head-tap')?.cooldownMs).toBe(500);
    expect(BUILT_IN_SCENE_REGISTRY.get('missing')).toBeNull();
    expect(BUILT_IN_SCENE_REGISTRY.byTrigger('touch::body::double').map((s) => s.id)).toEqual([
      'touch.body-double',
    ]);
    expect(BUILT_IN_SCENE_REGISTRY.byTrigger('touch::head::tap').map((s) => s.id)).toEqual([
      'touch.head-tap',
    ]);
    expect(BUILT_IN_SCENE_REGISTRY.byTrigger('touch::missing::tap')).toEqual([]);
  });

  it('保留旧动画图的关系门槛', () => {
    expect(BUILT_IN_SCENE_REGISTRY.get('touch.head-longpress')?.gating).toEqual({
      level: { min: 'acquaintance' },
    });
    expect(BUILT_IN_SCENE_REGISTRY.get('touch.raised-tap')?.gating).toEqual({
      level: { min: 'partner' },
    });
  });
});
