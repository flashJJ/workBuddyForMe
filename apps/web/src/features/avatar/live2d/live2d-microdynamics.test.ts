import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Live2dMicrodynamics } from './live2d-microdynamics';

/** 收集每帧写入的参数值 */
function fakeCore() {
  const values = new Map<string, number>();
  return {
    values,
    setParameterValueById(id: string, value: number) {
      values.set(id, value);
    },
  };
}

describe('Live2dMicrodynamics（v1.6 A 档微动作）', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('呼吸参数随时间正弦振荡（950ms 峰值、2850ms 谷值）', () => {
    let now = 950; // 周期 3800ms 的 1/4 处 → sin(π/2)
    const micro = new Live2dMicrodynamics(() => now);
    const core = fakeCore();
    micro.update(core, true);
    const peak = core.values.get('ParamBreath')!;
    now = 2850; // 3/4 周期 → sin(3π/2)
    micro.update(core, true);
    const valley = core.values.get('ParamBreath')!;
    expect(peak).toBeCloseTo(0.35, 5);
    expect(valley).toBeCloseTo(-0.35, 5);
  });

  it('指针新鲜时眼球跟随；超时无移动回正', () => {
    let now = 20_000;
    const micro = new Live2dMicrodynamics(() => now);
    const core = fakeCore();
    micro.setPointer(1, 0.5);
    micro.update(core, true);
    expect(core.values.get('ParamEyeBallX')).toBeCloseTo(0.9, 3);
    expect(core.values.get('ParamEyeBallY')).toBeCloseTo(0.45, 3);

    // 超过视线超时后回正
    now += 3000;
    micro.update(core, true);
    expect(core.values.get('ParamEyeBallX')).toBe(0);
    expect(core.values.get('ParamEyeBallY')).toBe(0);
  });

  it('说话/动作非安静期不发起头部微摆（保持 0）', () => {
    let now = 30_000;
    const micro = new Live2dMicrodynamics(() => now);
    const core = fakeCore();
    micro.update(core, false);
    expect(core.values.get('ParamAngleY')).toBeUndefined();
    now += 20_000;
    micro.update(core, false);
    // 非安静期只写视线/呼吸，头部摆动不触发（ParamAngleX 仅可能含视线增量 0）
    expect(core.values.get('ParamAngleX') ?? 0).toBe(0);
  });

  it('安静超过间隔后发起一次头部微摆，持续期结束回正', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.1);
    const start = 40_000;
    let now = start;
    const micro = new Live2dMicrodynamics(() => now);
    const core = fakeCore();
    // 首个间隔（9000ms）到达：发起微摆
    now = start + 9000;
    micro.update(core, true);
    // 微摆进行到一半（700ms 时）：头部角度应非 0
    now = start + 9000 + 700;
    micro.update(core, true);
    expect(Math.abs(core.values.get('ParamAngleX') ?? 0)).toBeGreaterThan(0);

    // 持续 1400ms 结束：回正
    now = start + 9000 + 1400;
    micro.update(core, true);
    expect(core.values.get('ParamAngleX')).toBe(0);
    expect(core.values.get('ParamAngleY')).toBe(0);
    vi.restoreAllMocks();
  });
});
