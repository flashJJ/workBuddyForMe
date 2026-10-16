import { describe, expect, it, vi } from 'vitest';
import { eventDefinitionSchema, type EventDefinition, type EventStep } from '@wbfm/shared/schemas';
import { EventRunner } from './runner';
import { createManualClock } from './clock';
import type { ConditionContext, EventEffectSink, EventRunGates } from './types';

function makeCtx(over: Partial<ConditionContext> = {}): ConditionContext {
  return {
    mood: { happiness: 0.1, anger: 0, sadness: 0 },
    relation: { intimacy: 10, trust: 5 },
    relationship: { level: 0 },
    personality: { frankness: 0.5, tsundere: 0.2, shy: 0.2, tolerance: 0.5 },
    counters: {},
    time: { hour: 12, lastInteractionMin: 2 },
    ...over,
  };
}

interface FakeEnv {
  sink: EventEffectSink;
  gates: { conv: boolean; tts: boolean; outlet: boolean } & EventRunGates;
  clock: ReturnType<typeof createManualClock>;
  calls: string[];
  invalidPaths: string[];
  setSpeechImpl(fn: (lineKey: string, speak: boolean, signal: AbortSignal) => Promise<void>): void;
  microtasks(n?: number): Promise<void>;
}

function makeEnv(): FakeEnv {
  const calls: string[] = [];
  const invalidPaths: string[] = [];
  const state = { conv: false, tts: false, outlet: true };
  let speechImpl: ((lineKey: string, speak: boolean, signal: AbortSignal) => Promise<void>) | null = null;
  const sink: EventEffectSink = {
    expression: (tag, d) => calls.push(`expression:${tag}${d ? `@${d}` : ''}`),
    motion: (g) => calls.push(`motion:${g}`),
    gaze: (x, y) => calls.push(`gaze:${x},${y}`),
    fx: (id) => calls.push(`fx:${id}`),
    spatial: (a) => calls.push(`spatial:${a}`),
    speech: (lineKey, speak, signal) => {
      calls.push(`speech:${lineKey}:${speak ? 'tts' : 'bubble'}`);
      return speechImpl ? speechImpl(lineKey, speak, signal) : Promise.resolve();
    },
    release: () => calls.push('release'),
  };
  const gates: FakeEnv['gates'] = Object.assign(state, {
    isConvLocked: () => state.conv,
    isTtsLocked: () => state.tts,
    hasOutlet: () => state.outlet,
  });
  const clock = createManualClock(1_000_000);
  const microtasks = async (n = 1) => {
    for (let i = 0; i < n; i += 1) await Promise.resolve();
  };
  return {
    sink,
    gates,
    clock,
    calls,
    invalidPaths,
    setSpeechImpl: (fn) => {
      speechImpl = fn;
    },
    microtasks,
  };
}

function defOf(steps: EventStep[], over: Partial<EventDefinition> = {}): EventDefinition {
  return eventDefinitionSchema.parse({
    id: 'ev.test.case',
    titleKey: 'event.test.title',
    priority: 2,
    interruptPolicy: 'ignore',
    cooldownMs: 60_000,
    speechLock: 'queue',
    steps,
    ...over,
  });
}

async function run(env: FakeEnv, def: EventDefinition, ctx = makeCtx()) {
  const runner = new EventRunner(def, ctx, {
    sink: env.sink,
    gates: env.gates,
    clock: env.clock,
    onInvalidCondition: (p) => env.invalidPaths.push(p),
  });
  const result = await runner.done();
  return { runner, result };
}

describe('EventRunner', () => {
  it('顺序执行视觉/wait/speech 并在终态 release 一次', async () => {
    const env = makeEnv();
    const { result } = await run(env, defOf([
      { kind: 'expression', tag: 'joy' },
      { kind: 'fx', id: 'hearts' },
      { kind: 'spatial', action: 'hop' },
      { kind: 'wait', ms: 300 },
      { kind: 'speech', lineKey: 'event.x.y' },
    ]));
    expect(result.outcome).toBe('played');
    expect(result.effectsFired).toBe(5);
    expect(env.calls).toEqual([
      'expression:joy', 'fx:hearts', 'spatial:hop',
      'speech:event.x.y:tts', 'release',
    ]);
    expect(env.calls.filter((c) => c === 'release')).toHaveLength(1);
  });

  it('branch 命中前跳、未命中顺序、空 when 无条件跳转', async () => {
    const env = makeEnv();
    const def = defOf([
      { kind: 'expression', tag: 'neutral' },          // 0
      { kind: 'branch', when: [{ path: 'mood.happiness', op: 'gte', value: 0.5 }], goto: 4 }, // 1
      { kind: 'expression', tag: 'anger' },            // 2
      { kind: 'wait', ms: 100 },                       // 3
      { kind: 'fx', id: 'sparkle' },                   // 4
    ]);
    const hit = await run(env, def, makeCtx({ mood: { happiness: 0.8, anger: 0, sadness: 0 } }));
    expect(hit.result.outcome).toBe('played');
    expect(env.calls).toEqual(['expression:neutral', 'fx:sparkle', 'release']);

    const env2 = makeEnv();
    const miss = await run(env2, def, makeCtx({ mood: { happiness: 0.1, anger: 0, sadness: 0 } }));
    expect(miss.result.outcome).toBe('played');
    expect(env2.calls).toEqual(['expression:neutral', 'expression:anger', 'fx:sparkle', 'release']);

    const env3 = makeEnv();
    const always = await run(env3, defOf([
      { kind: 'expression', tag: 'neutral' },           // 0
      { kind: 'branch', when: [], goto: 3 },            // 1 → 跳到 sweat
      { kind: 'expression', tag: 'fear' },             // 2 应被跳过
      { kind: 'fx', id: 'sweat' },                     // 3
    ]));
    expect(always.result.outcome).toBe('played');
    expect(env3.calls).toEqual(['expression:neutral', 'fx:sweat', 'release']);
  });

  it('非法条件按 false 走默认支线并回调', async () => {
    const env = makeEnv();
    await run(env, defOf([
      { kind: 'branch', when: [{ path: 'globals.exit', op: 'eq', value: 1 }], goto: 2 },
      { kind: 'fx', id: 'sweat' },
      { kind: 'expression', tag: 'joy' },
    ]));
    expect(env.calls).toContain('fx:sweat');
    expect(env.invalidPaths).toContain('globals.exit');
  });

  it('演出中用户 skip → skipped/user_skip 且 release', async () => {
    const env = makeEnv();
    let releaseSpeech: () => void = () => {};
    env.setSpeechImpl(() => new Promise<void>((resolve) => {
      releaseSpeech = resolve;
    }));
    const runner = new EventRunner(defOf([
      { kind: 'expression', tag: 'joy' },
      { kind: 'speech', lineKey: 'event.long' },
    ]), makeCtx(), { sink: env.sink, gates: env.gates, clock: env.clock });
    await env.microtasks(2);
    expect(env.calls).toContain('speech:event.long:tts');
    runner.skip();
    releaseSpeech();
    const result = await runner.done();
    expect(result.outcome).toBe('skipped');
    expect(result.reason).toBe('user_skip');
    expect(env.calls.lastIndexOf('release')).toBe(env.calls.length - 1);
  });

  it('step 边界检测到 CONV 锁 → interrupted/conv_start', async () => {
    const env = makeEnv();
    // 第一个视觉 step 执行后 CONV 立即上锁，wait step 边界应中止
    env.sink.fx = vi.fn(() => {
      env.gates.conv = true;
    });
    const { result } = await run(env, defOf([
      { kind: 'fx', id: 'hearts' },
      { kind: 'wait', ms: 500 },
      { kind: 'expression', tag: 'joy' },
    ]));
    expect(result.outcome).toBe('interrupted');
    expect(result.reason).toBe('conv_start');
    expect(env.calls).not.toContain('expression:joy');
  });

  it('speech queue：等待 TTS 锁，轮询期间释放后出声', async () => {
    const env = makeEnv();
    let checks = 0;
    env.gates.isTtsLocked = () => {
      checks += 1;
      // 首次检查 + 前两次轮询为占用，之后释放
      return checks <= 3;
    };
    const { result } = await run(env, defOf([{ kind: 'speech', lineKey: 'event.q' }], { speechLock: 'queue' }));
    expect(result.outcome).toBe('played');
    expect(env.calls).toContain('speech:event.q:tts');
    expect(checks).toBeGreaterThanOrEqual(3);
  });

  it('speech queue 等锁超时（30s）→ 纯气泡仍呈现', async () => {
    const env = makeEnv();
    env.gates.tts = true;
    const { result } = await run(env, defOf([{ kind: 'speech', lineKey: 'event.q' }], { speechLock: 'queue' }));
    expect(result.outcome).toBe('played');
    expect(env.calls).toContain('speech:event.q:bubble');
    expect(env.clock.now()).toBeGreaterThanOrEqual(1_000_000 + 30_000);
  }, 10_000);

  it('speechLock=skip 遇锁立即放弃出声；tts:false 不查锁', async () => {
    const env = makeEnv();
    env.gates.tts = true;
    const skip = await run(env, defOf([{ kind: 'speech', lineKey: 'event.a' }], { speechLock: 'skip' }));
    expect(skip.result.outcome).toBe('played');
    expect(env.calls).toContain('speech:event.a:bubble');

    const env2 = makeEnv();
    env2.gates.tts = true;
    await run(env2, defOf([{ kind: 'speech', lineKey: 'event.b', tts: false }]));
    expect(env2.calls).toContain('speech:event.b:bubble');
  });

  it('看门狗 20s 强制收尾（手动推进时钟）', async () => {
    const env = makeEnv();
    env.setSpeechImpl(() => new Promise<void>(() => {})); // 永不完成
    const runner = new EventRunner(defOf([{ kind: 'speech', lineKey: 'event.hang' }]), makeCtx(), {
      sink: env.sink, gates: env.gates, clock: env.clock,
    });
    await env.microtasks(2);
    env.clock.advance(20_001);
    const result = await runner.done();
    expect(result.outcome).toBe('interrupted');
    expect(result.reason).toBe('watchdog');
  });

  it('queue 等 TTS 期间 CONV 上锁 → 立即 interrupted/conv_start', async () => {
    const env = makeEnv();
    let checks = 0;
    // 第二个锁检查点（进入轮询循环时）置 CONV
    env.gates.isTtsLocked = () => {
      checks += 1;
      if (checks >= 2) env.gates.conv = true;
      return true;
    };
    const runner = new EventRunner(defOf([{ kind: 'speech', lineKey: 'event.q' }], { speechLock: 'queue' }), makeCtx(), {
      sink: env.sink, gates: env.gates, clock: env.clock,
    });
    const result = await runner.done();
    expect(result.outcome).toBe('interrupted');
    expect(result.reason).toBe('conv_start');
    expect(env.calls).not.toContain('speech:event.q:tts');
  });

  it('TTS 与 CONV 同时上锁 → 不等锁直接 interrupted/conv_start', async () => {
    const env = makeEnv();
    env.gates.tts = true;
    env.gates.conv = true;
    const { result } = await run(env, defOf([{ kind: 'speech', lineKey: 'event.q' }]));
    expect(result.outcome).toBe('interrupted');
    expect(result.reason).toBe('conv_start');
  });

  it('sink 抛异常不击垮引擎，按打断收尾并 release', async () => {
    const env = makeEnv();
    env.sink.motion = () => {
      throw new Error('boom');
    };
    const { result } = await run(env, defOf([{ kind: 'motion', group: 'tap' }]));
    expect(result.outcome).toBe('interrupted');
    expect(result.reason).toBe('higher_priority');
    expect(env.calls).toContain('release');
  });
});
