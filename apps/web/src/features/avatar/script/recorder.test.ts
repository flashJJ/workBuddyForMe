import { describe, expect, it } from 'vitest';
import { ACTION_CHAINS, type ActionChainId, type InteractionAction } from '@wbfm/shared/schemas';
import { CueRecorder, observeAction, type ObservedCue } from './recorder';

/** 可控时钟：默认从 1000 起，避免把「首条记录归零」误判成真实时间戳 */
class FakeClock {
  private t: number;

  constructor(start = 1000) {
    this.t = start;
  }

  now = (): number => this.t;

  advance(ms: number): void {
    this.t += ms;
  }
}

function observeChains(chainId: ActionChainId): ObservedCue[] {
  const recorder = new CueRecorder({ now: () => 0 });
  recorder.recordChain(ACTION_CHAINS[chainId]());
  return recorder.log.map((entry) => entry.cue);
}

describe('observeAction（动作 → 观测 cue）', () => {
  it('有表现语义的动作逐一映射', () => {
    const cases: Array<[InteractionAction, ObservedCue]> = [
      [
        { type: 'interaction.start', kind: 'head-touch' },
        { kind: 'interaction', phase: 'start', interaction: 'head-touch' },
      ],
      [{ type: 'interaction.end' }, { kind: 'interaction', phase: 'end' }],
      [{ type: 'controller.playSquash' }, { kind: 'squash' }],
      [{ type: 'controller.tap' }, { kind: 'tap' }],
      [
        { type: 'controller.flashExpression', tag: 'joy', durationMs: 2600 },
        { kind: 'expression', tag: 'joy', flash: true, holdMs: 2600 },
      ],
      [
        { type: 'controller.setExpression', tag: 'smirk' },
        { kind: 'expression', tag: 'smirk', flash: false },
      ],
      [
        { type: 'subtitle.pick', pool: 'head-tap', durationMs: 3200 },
        { kind: 'line', pool: 'head-tap', durationMs: 3200 },
      ],
      [
        { type: 'subtitle.show', i18nKey: 'emotion.touch.blush0', durationMs: 1200 },
        { kind: 'subtitle', i18nKey: 'emotion.touch.blush0', durationMs: 1200 },
      ],
    ];
    for (const [action, expected] of cases) expect(observeAction(action)).toEqual(expected);
  });
});

describe('CueRecorder（fake clock 相对时间轴）', () => {
  it('首条归零，后续按注入时钟累计', () => {
    const clock = new FakeClock();
    const recorder = new CueRecorder({ now: clock.now });
    recorder.record({ type: 'controller.tap' });
    clock.advance(16);
    recorder.record({ type: 'controller.playSquash' });
    clock.advance(120);
    recorder.record({ type: 'controller.flashExpression', tag: 'joy', durationMs: 2400 });

    expect(recorder.log.map((entry) => entry.at)).toEqual([0, 16, 136]);
    expect(recorder.log.map((entry) => entry.cue.kind)).toEqual(['tap', 'squash', 'expression']);
  });

  it('reset 后清空日志并重新归零', () => {
    const clock = new FakeClock();
    const recorder = new CueRecorder({ now: clock.now });
    recorder.record({ type: 'controller.tap' });
    clock.advance(50);
    recorder.reset();
    recorder.record({ type: 'controller.playSquash' });
    expect(recorder.log).toEqual([{ at: 0, cue: { kind: 'squash' } }]);
  });
});

describe('6 条内置触摸链的黄金 cue 序列', () => {
  it('head-tap', () => {
    expect(observeChains('head-tap')).toEqual([
      { kind: 'interaction', phase: 'start', interaction: 'head-touch' },
      { kind: 'squash' },
      { kind: 'tap' },
      { kind: 'expression', tag: 'joy', flash: true, holdMs: 2600 },
      { kind: 'line', pool: 'head-tap' },
    ]);
  });

  it('head-longpress', () => {
    expect(observeChains('head-longpress')).toEqual([
      { kind: 'interaction', phase: 'start', interaction: 'head-touch' },
      { kind: 'squash' },
      { kind: 'expression', tag: 'surprise', flash: true, holdMs: 4200 },
      { kind: 'line', pool: 'head-longpress' },
    ]);
  });

  it('body-tap', () => {
    expect(observeChains('body-tap')).toEqual([
      { kind: 'interaction', phase: 'start', interaction: 'body-touch' },
      { kind: 'squash' },
      { kind: 'tap' },
      { kind: 'expression', tag: 'smirk', flash: true, holdMs: 1800 },
      { kind: 'line', pool: 'body-tap' },
    ]);
  });

  it('body-longpress', () => {
    expect(observeChains('body-longpress')).toEqual([
      { kind: 'interaction', phase: 'start', interaction: 'body-touch' },
      { kind: 'squash' },
      { kind: 'expression', tag: 'joy', flash: true, holdMs: 2400 },
      { kind: 'line', pool: 'body-longpress' },
    ]);
  });

  it('body-double', () => {
    expect(observeChains('body-double')).toEqual([
      { kind: 'interaction', phase: 'start', interaction: 'body-touch' },
      { kind: 'expression', tag: 'smirk', flash: false },
      { kind: 'tap' },
      { kind: 'expression', tag: 'joy', flash: true, holdMs: 1400 },
      { kind: 'line', pool: 'body-double' },
    ]);
  });

  it('raised-tap', () => {
    expect(observeChains('raised-tap')).toEqual([
      { kind: 'interaction', phase: 'start', interaction: 'raised' },
      { kind: 'squash' },
      { kind: 'expression', tag: 'surprise', flash: true, holdMs: 2000 },
      { kind: 'line', pool: 'raised' },
    ]);
  });
});
