import { describe, expect, it } from 'vitest';
import { BehaviorLibrary, BehaviorRunner } from '../behavior';
import type { BehaviorDefinition } from '../contracts';

function behavior(
  id: string,
  priority: 0 | 1 | 2 | 3,
  interrupt: 'all' | 'never' = 'all',
): BehaviorDefinition {
  return {
    id,
    priority,
    interrupt,
    enter: { durationMs: 100, tracks: [{ kind: 'pose', mask: { include: ['head'] }, pose: `${id}.enter` }] },
    loop: { tracks: [{ kind: 'pose', mask: { include: ['head'] }, pose: `${id}.loop` }] },
    exit: { durationMs: 80, tracks: [] },
  };
}

function setup(...defs: BehaviorDefinition[]): BehaviorRunner {
  return new BehaviorRunner(new BehaviorLibrary(defs));
}

describe('BehaviorRunner 阶段机', () => {
  it('enter 计时结束进入 loop，余量带入下一阶段', () => {
    const runner = setup(behavior('a', 0));
    expect(runner.play('a')).toBe(true);
    expect(runner.phase).toBe('enter');
    expect(runner.tracks[0]).toMatchObject({ pose: 'a.enter' });

    runner.update(50);
    expect(runner.phase).toBe('enter');
    runner.update(60);
    expect(runner.phase).toBe('loop');
    expect(runner.phaseElapsedMs).toBeCloseTo(10, 6);
    expect(runner.tracks[0]).toMatchObject({ pose: 'a.loop' });
  });

  it('dt = 0 冻结阶段与权重（hidden 档）', () => {
    const runner = setup(behavior('a', 0));
    runner.play('a');
    runner.update(60);
    const elapsed = runner.elapsedMs;
    const weight = runner.weight;
    runner.update(0);
    expect(runner.elapsedMs).toBe(elapsed);
    expect(runner.weight).toBe(weight);
  });

  it('stop 进入 exit，结束后回到空闲', () => {
    const runner = setup(behavior('a', 0));
    runner.play('a');
    runner.update(120);
    expect(runner.phase).toBe('loop');
    expect(runner.stop()).toBe(true);
    expect(runner.phase).toBe('exit');
    runner.update(80);
    expect(runner.active).toBe(false);
    expect(runner.stop()).toBe(false);
  });

  it('权重从 0 淡入', () => {
    const runner = setup(behavior('a', 0));
    runner.play('a');
    expect(runner.weight).toBe(0);
    runner.update(100);
    expect(runner.weight).toBeGreaterThan(0.5);
    expect(runner.weight).toBeLessThan(1);
  });

  it('未知行为被忽略', () => {
    const runner = setup(behavior('a', 0));
    expect(runner.play('missing')).toBe(false);
    expect(runner.active).toBe(false);
  });
});

describe('BehaviorRunner 打断与队列', () => {
  it('interrupt: never 时新请求进队列，结束后接续', () => {
    const runner = setup(behavior('a', 0, 'never'), behavior('b', 0));
    runner.play('a');
    expect(runner.play('b')).toBe(false);
    expect(runner.behaviorId).toBe('a');
    runner.stop();
    runner.update(80);
    expect(runner.behaviorId).toBe('b');
  });

  it('高优先级立即打断', () => {
    const runner = setup(behavior('low', 2), behavior('high', 0));
    runner.play('low');
    expect(runner.play('high')).toBe(true);
    expect(runner.behaviorId).toBe('high');
  });

  it('同优先级不抢占，进队列', () => {
    const runner = setup(behavior('a', 1), behavior('b', 1));
    runner.play('a');
    expect(runner.play('b')).toBe(false);
    expect(runner.behaviorId).toBe('a');
  });

  it('exit 收尾阶段不可被同级打断，可被更高优先级打断', () => {
    const runner = setup(behavior('a', 1), behavior('b', 1), behavior('c', 0));
    runner.play('a');
    runner.update(120);
    runner.stop();
    expect(runner.play('b')).toBe(false);
    expect(runner.behaviorId).toBe('a');
    expect(runner.play('c')).toBe(true);
    expect(runner.behaviorId).toBe('c');
  });

  it('队列按优先级（数值小优先）出队', () => {
    const runner = setup(behavior('a', 0), behavior('b', 2), behavior('c', 1));
    runner.play('a');
    runner.play('b');
    runner.play('c');
    runner.stop();
    runner.update(80);
    expect(runner.behaviorId).toBe('c');
  });

  it('未声明 enter/loop 的行为收尾后自动结束', () => {
    const runner = setup({ id: 'brief', priority: 0, interrupt: 'all', exit: { durationMs: 40, tracks: [] } });
    expect(runner.play('brief')).toBe(true);
    expect(runner.phase).toBe('exit');
    runner.update(40);
    expect(runner.active).toBe(false);
  });

  it('playNow 强制接管并清空排队行为', () => {
    const runner = setup(behavior('a', 1), behavior('b', 1), behavior('c', 2));
    runner.play('a');
    runner.play('b');
    runner.play('c');
    expect(runner.queuedIds).toEqual(['b', 'c']);
    expect(runner.playNow('c')).toBe(true);
    expect(runner.behaviorId).toBe('c');
    expect(runner.queuedIds).toEqual([]);
  });

  it('排队上限 4，防止连续交互无限堆积', () => {
    const defs = ['a', 'b', 'c', 'd', 'e', 'f'].map((id) => behavior(id, 1));
    const runner = setup(...defs);
    runner.play('a');
    for (const id of ['b', 'c', 'd', 'e', 'f']) runner.play(id);
    expect(runner.queuedIds).toHaveLength(4);
  });
});
