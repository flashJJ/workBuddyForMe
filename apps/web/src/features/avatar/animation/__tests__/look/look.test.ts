import { describe, expect, it } from 'vitest';
import { LOOK_DIRECTIONS } from '../../look';
import { VrmAnimationRuntime } from '../../adapters/vrm';

describe('LOOK_DIRECTIONS', () => {
  it('与剧本 cue 的视线目标一一对应', () => {
    expect(LOOK_DIRECTIONS.camera).toEqual([0, 0]);
    expect(LOOK_DIRECTIONS.away).toEqual([0.7, 0]);
    expect(LOOK_DIRECTIONS.up).toEqual([0, -1]);
    expect(LOOK_DIRECTIONS.down).toEqual([0, 1]);
  });
});

describe('look 轨道（T2.4）', () => {
  it('face-away 行为声明 away 视线，随行为权重淡入', () => {
    const runtime = new VrmAnimationRuntime(new Map());
    runtime.play('behavior.face-away');
    runtime.update(400);

    expect(runtime.activeLookTarget).toBe('away');
    expect(runtime.activeLookWeight).toBeGreaterThan(0.9);
  });

  it('停止行为后清除视线，交还指针 gaze', () => {
    const runtime = new VrmAnimationRuntime(new Map());
    runtime.play('behavior.face-away');
    runtime.update(200);
    expect(runtime.activeLookTarget).toBe('away');

    runtime.stop();
    runtime.update(400);
    expect(runtime.activeLookTarget).toBeNull();
    expect(runtime.activeLookWeight).toBe(0);
  });

  it('无 look 轨道的行为不产生视线覆盖', () => {
    const runtime = new VrmAnimationRuntime(new Map());
    runtime.play('behavior.lifted');
    runtime.update(200);
    expect(runtime.activeLookTarget).toBeNull();
  });
});
