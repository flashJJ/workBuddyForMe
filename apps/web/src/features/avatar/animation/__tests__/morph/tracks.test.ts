import { describe, expect, it } from 'vitest';
import animeartBinding from '../../bindings/animeart-v1.json';
import { buildMorphBinding } from '../../binding';
import { MorphExecutor } from '../../morph';
import { VrmAnimationRuntime } from '../../adapters/vrm';

const binding = buildMorphBinding(animeartBinding);

function setup(): { runtime: VrmAnimationRuntime; influences: number[] } {
  const influences = new Array<number>(binding.definition.morphCount).fill(0);
  const dictionary: Record<string, number> = {};
  for (const target of binding.definition.targets) dictionary[target.name] = target.index;
  const executor = new MorphExecutor(binding, { influences, dictionary });
  const runtime = new VrmAnimationRuntime(new Map());
  runtime.attachMorph(executor);
  return { runtime, influences };
}

function firstIndex(channel: string): number {
  return binding.resolve(channel)?.[0]?.index ?? -1;
}

describe('morph 轨道（T2.3）', () => {
  it('行为表情随行为权重淡入并写入 morph', () => {
    const { runtime, influences } = setup();
    runtime.play('behavior.face-away');
    runtime.update(400);

    const channels = runtime.morph?.channels ?? {};
    expect(channels['brow.bored']).toBeGreaterThan(0.6);
    expect(channels['mouth.sad']).toBeGreaterThan(0.3);

    expect(runtime.applyMorph()).toBeGreaterThan(0);
    expect(influences[firstIndex('brow.bored')]).toBeGreaterThan(0.6);
  });

  it('enter → loop 切换后按新阶段表情取值，不叠加', () => {
    const { runtime } = setup();
    runtime.play('behavior.lifted');
    runtime.update(70);
    expect(runtime.morph?.channels['brow.surprised']).toBeGreaterThan(0.8);

    runtime.update(20); // 越过 80ms enter，进入 loop
    expect(runtime.morph?.channels['brow.angry']).toBeCloseTo(0.55, 1);
    expect(runtime.morph?.channels['mouth.angry']).toBeCloseTo(0.3, 1);
  });

  it('预览打底、行为覆盖同名通道，行为结束后恢复预览', () => {
    const { runtime } = setup();
    runtime.setMorphChannels({ 'brow.bored': 1, 'expr.joy': 1 });

    runtime.play('behavior.face-away');
    runtime.update(400);
    const active = runtime.morph?.channels ?? {};
    expect(active['brow.bored']).toBeGreaterThan(0.6); // 行为 0.7 覆盖预览 1
    expect(active['brow.bored']).toBeLessThan(0.9);
    expect(active['expr.joy']).toBe(1); // 行为未覆盖的预览通道保留

    runtime.stop();
    runtime.update(400);
    const restored = runtime.morph?.channels ?? {};
    expect(restored['brow.bored']).toBe(1);
    expect(restored['expr.joy']).toBe(1);
  });

  it('行为结束后释放所有写入的 morph', () => {
    const { runtime, influences } = setup();
    runtime.play('behavior.face-away');
    runtime.update(200);
    runtime.applyMorph();
    expect(influences.some((value) => value > 0)).toBe(true);

    runtime.stop();
    runtime.update(400);
    expect(runtime.morph?.channels).toEqual({});
    runtime.applyMorph();
    expect(influences.every((value) => value === 0)).toBe(true);
  });
});
