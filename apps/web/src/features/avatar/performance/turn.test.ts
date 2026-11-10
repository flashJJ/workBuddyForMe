import { describe, expect, it } from 'vitest';
import { TURN_AWAY_THRESHOLD, TurnState } from './turn';

describe('TurnState（背对/转身）', () => {
  it('背对后按帧平滑转到 π，再转回 0', () => {
    const state = new TurnState();
    state.setAway(true);
    expect(state.away).toBe(false);

    for (let i = 0; i < 60; i += 1) state.update(1 / 30);
    expect(state.yaw).toBeGreaterThan(TURN_AWAY_THRESHOLD);
    expect(state.away).toBe(true);

    for (let i = 0; i < 120; i += 1) state.update(1 / 30);
    expect(state.yaw).toBeCloseTo(Math.PI, 2);
    expect(state.turning).toBe(false);

    state.setAway(false);
    for (let i = 0; i < 120; i += 1) state.update(1 / 30);
    expect(state.yaw).toBeCloseTo(0, 2);
    expect(state.away).toBe(false);
  });

  it('dt 为 0 时不推进（隐藏档恢复不会瞬移）', () => {
    const state = new TurnState();
    state.setAway(true);
    state.update(0);
    expect(state.yaw).toBe(0);
  });
});
