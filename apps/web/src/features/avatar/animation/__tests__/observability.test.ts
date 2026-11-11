import { afterEach, describe, expect, it } from 'vitest';
import { BehaviorLibrary, BehaviorRunner } from '../behavior';
import type { BehaviorDefinition } from '../contracts';
import {
  BEHAVIOR_TRANSITION_LIMIT,
  BehaviorObserver,
  getBehaviorDebug,
  setBehaviorDebugSource,
} from '../observability';

const TEST_BEHAVIOR: BehaviorDefinition = {
  id: 'behavior.test',
  priority: 1,
  interrupt: 'all',
  enter: {
    durationMs: 100,
    tracks: [{ kind: 'pose', mask: { include: ['head'] }, pose: 'pose.enter' }],
  },
  loop: {
    tracks: [{ kind: 'pose', mask: { include: ['head'] }, pose: 'pose.loop', weight: 0.5 }],
  },
  exit: {
    durationMs: 100,
    tracks: [{ kind: 'pose', mask: { include: ['head'] }, pose: 'pose.exit' }],
  },
};

function setup(): { runner: BehaviorRunner; observer: BehaviorObserver } {
  const runner = new BehaviorRunner(new BehaviorLibrary([TEST_BEHAVIOR]));
  return { runner, observer: new BehaviorObserver() };
}

afterEach(() => setBehaviorDebugSource(null));

describe('BehaviorObserver', () => {
  it('按 enter → loop → exit → 结束记录阶段过渡', () => {
    const { runner, observer } = setup();
    observer.sample(runner);
    runner.play('behavior.test');
    observer.sample(runner);
    runner.update(100);
    observer.sample(runner);
    runner.stop();
    observer.sample(runner);
    runner.update(100);
    observer.sample(runner);

    expect(observer.snapshot(runner).transitions).toEqual([
      { id: 'behavior.test', phase: 'enter', atMs: 0 },
      { id: 'behavior.test', phase: 'loop', atMs: 100 },
      { id: 'behavior.test', phase: 'exit', atMs: 100 },
      { id: null, phase: null, atMs: 100 },
    ]);
  });

  it('快照输出当前阶段、轨道与叠加权重', () => {
    const { runner, observer } = setup();
    runner.play('behavior.test');
    runner.update(200);
    const snapshot = observer.snapshot(runner);

    expect(snapshot.id).toBe('behavior.test');
    expect(snapshot.phase).toBe('loop');
    expect(snapshot.tracks).toHaveLength(1);
    const track = snapshot.tracks[0];
    expect(track?.kind).toBe('pose');
    expect(track?.ref).toBe('pose.loop');
    expect(track?.weight ?? 0).toBeGreaterThan(0);
    expect(track?.weight ?? 1).toBeLessThanOrEqual(0.5);
  });

  it('过渡记录最多保留 10 条', () => {
    const { runner, observer } = setup();
    for (let i = 0; i < 12; i += 1) {
      runner.play('behavior.test');
      observer.sample(runner);
      runner.stop();
      observer.sample(runner);
      runner.update(100);
      observer.sample(runner);
    }
    const { transitions } = observer.snapshot(runner);
    expect(transitions.length).toBe(BEHAVIOR_TRANSITION_LIMIT);
    expect(transitions.at(-1)?.id).toBeNull();
  });
});

describe('行为观测源', () => {
  it('注册后可读取快照，清除后返回 null', () => {
    const { runner, observer } = setup();
    setBehaviorDebugSource(() => observer.snapshot(runner));
    expect(getBehaviorDebug()?.id).toBeNull();

    setBehaviorDebugSource(null);
    expect(getBehaviorDebug()).toBeNull();
  });
});
