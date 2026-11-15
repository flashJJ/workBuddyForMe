import { describe, expect, it, vi } from 'vitest';
import type {
  ExpressionTag,
  StageExpressionIntensity,
  StageSlot,
} from '@wbfm/shared/schemas';
import { applyStageDirection } from '../../apply-stage-direction';
import { findTheaterEpisode, theaterDirections } from '../theater-script';

const SLOTS: StageSlot[] = ['left', 'center', 'right', 'farRight'];

/** 只保留表情相关状态，其余 setter 用 spy 记录调用 */
function createRuntime() {
  let expressions = Object.fromEntries(SLOTS.map((slot) => [slot, 'neutral'])) as Record<
    StageSlot,
    ExpressionTag
  >;
  let intensities = Object.fromEntries(SLOTS.map((slot) => [slot, 2])) as Record<
    StageSlot,
    StageExpressionIntensity
  >;
  return {
    setCast: vi.fn(),
    setFocus: vi.fn(),
    setExpressions: (updater: (prev: typeof expressions) => typeof expressions) => {
      expressions = updater(expressions);
    },
    setExpressionIntensities: (updater: (prev: typeof intensities) => typeof intensities) => {
      intensities = updater(intensities);
    },
    setSpeech: vi.fn(),
    setMotions: vi.fn(),
    setLastLine: vi.fn(),
    get expressions() {
      return expressions;
    },
    get intensities() {
      return intensities;
    },
  };
}

describe('舞台表情强度（M4）', () => {
  it('expression 指令写入 tag 与 intensity，缺省回落 2', () => {
    const runtime = createRuntime();

    applyStageDirection(runtime, { t: 'expression', slot: 'left', tag: 'joy', intensity: 3 });
    expect(runtime.expressions.left).toBe('joy');
    expect(runtime.intensities.left).toBe(3);

    applyStageDirection(runtime, { t: 'expression', slot: 'left', tag: 'sadness' });
    expect(runtime.expressions.left).toBe('sadness');
    expect(runtime.intensities.left).toBe(2);
  });

  it('换 cast 时强度重置为 2，避免沿用上一集', () => {
    const runtime = createRuntime();
    applyStageDirection(runtime, { t: 'expression', slot: 'center', tag: 'smirk', intensity: 1 });
    expect(runtime.intensities.center).toBe(1);

    const episode = findTheaterEpisode();
    applyStageDirection(runtime, { t: 'cast', members: episode.cast });
    expect(runtime.intensities).toEqual({ left: 2, center: 2, right: 2, farRight: 2 });
    expect(runtime.expressions).toEqual({
      left: 'neutral',
      center: 'neutral',
      right: 'neutral',
      farRight: 'neutral',
    });
  });

  it('剧场每句指令可端到端落到强度状态', () => {
    const episode = findTheaterEpisode();
    const runtime = createRuntime();

    for (const direction of theaterDirections(episode, 1)) applyStageDirection(runtime, direction);
    expect(runtime.expressions.left).toBe('joy');
    expect(runtime.intensities.left).toBe(3);

    for (const direction of theaterDirections(episode, 0)) applyStageDirection(runtime, direction);
    expect(runtime.expressions.center).toBe(episode.lines[0]!.expression);
    expect(runtime.intensities.center).toBe(2);
  });
});
