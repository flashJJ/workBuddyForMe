import { describe, expect, it } from 'vitest';
import animeartBinding from '../../bindings/animeart-v1.json';
import { buildMorphBinding } from '../../binding';
import { MorphExecutor } from '../../morph';
import { VrmAnimationRuntime } from '../../adapters/vrm';

const binding = buildMorphBinding(animeartBinding);

/** 按 binding 构造 118 长度的可写网格替身 */
function makeMesh(): { influences: number[]; dictionary: Record<string, number> } {
  const influences = new Array<number>(binding.definition.morphCount).fill(0);
  const dictionary: Record<string, number> = {};
  for (const target of binding.definition.targets) dictionary[target.name] = target.index;
  return { influences, dictionary };
}

function indexOf(channel: string, name: string): number {
  const target = binding.resolve(channel)?.find((item) => item.name === name);
  if (!target) throw new Error(`binding 缺少 ${channel}/${name}`);
  return target.index;
}

describe('MorphExecutor', () => {
  it('单通道写入命中 binding 索引，不触碰其他 morph', () => {
    const mesh = makeMesh();
    const executor = new MorphExecutor(binding, mesh);
    expect(executor.available).toBe(true);

    const written = executor.apply(new Map([['eye.smile', 1]]));
    expect(written).toBe(binding.resolve('eye.smile')?.length);
    expect(mesh.influences[indexOf('eye.smile', 'Eyes_smile_cl')]).toBeCloseTo(1);

    const touched = mesh.influences.filter((value) => value !== 0);
    expect(touched).toHaveLength(binding.resolve('eye.smile')?.length ?? 0);
  });

  it('网格被拆成多个 primitive 时同步写入全部网格', () => {
    const first = makeMesh();
    const second = makeMesh();
    const executor = new MorphExecutor(binding, [first, second]);
    expect(executor.available).toBe(true);

    const written = executor.apply(new Map([['brow.angry', 0.5]]));
    expect(written).toBe((binding.resolve('brow.angry')?.length ?? 0) * 2);
    for (const mesh of [first, second]) {
      expect(mesh.influences[indexOf('brow.angry', 'Eyebrows_angry_cl')]).toBeCloseTo(0.5);
    }

    executor.apply(new Map());
    expect(first.influences.every((value) => value === 0)).toBe(true);
    expect(second.influences.every((value) => value === 0)).toBe(true);
  });

  it('多通道共享 morph 时累加并截断到 1', () => {
    const mesh = makeMesh();
    const executor = new MorphExecutor(binding, mesh);
    executor.apply(new Map([
      ['expr.joy', 1],
      ['eye.smile', 1],
    ]));
    // expr.joy 与 eye.smile 都绑定 Eyes_smile_cl：叠加后仍不超过 1
    expect(mesh.influences[indexOf('eye.smile', 'Eyes_smile_cl')]).toBe(1);
    expect(mesh.influences[indexOf('expr.joy', 'Mouth_happy_broad_cl')]).toBe(1);
  });

  it('首次触达先清零，不叠加在 preset 权重之上', () => {
    const mesh = makeMesh();
    const index = indexOf('eye.smile', 'Eyes_smile_cl');
    mesh.influences[index] = 0.5; // 模拟 three-vrm 已写入 happy
    const executor = new MorphExecutor(binding, mesh);
    executor.apply(new Map([['eye.smile', 0.6]]));
    expect(mesh.influences[index]).toBeCloseTo(0.6);
  });

  it('未知通道与保留通道被忽略', () => {
    const mesh = makeMesh();
    const executor = new MorphExecutor(binding, mesh);
    const written = executor.apply(new Map([
      ['not.exist', 1],
      ['blink', 1],
      ['viseme.a', 1],
    ]));
    expect(written).toBe(0);
    expect(mesh.influences.every((value) => value === 0)).toBe(true);
  });

  it('值为 0 时释放所有权，下一帧 preset 不再被压成 0', () => {
    const mesh = makeMesh();
    const index = indexOf('eye.smile', 'Eyes_smile_cl');
    const executor = new MorphExecutor(binding, mesh);
    executor.apply(new Map([['eye.smile', 1]]));
    expect(mesh.influences[index]).toBe(1);

    // 释放帧会把上一帧自己写的索引归零，避免表情残留
    executor.apply(new Map([['eye.smile', 0]]));
    expect(mesh.influences[index]).toBe(0);

    // 下一帧 preset 重新写入后，执行器已不再持有该索引
    mesh.influences[index] = 0.4;
    executor.apply(new Map());
    expect(mesh.influences[index]).toBeCloseTo(0.4);
  });

  it('clear 只清自己写过的索引，之后不再触碰', () => {
    const mesh = makeMesh();
    const eyes = indexOf('eye.smile', 'Eyes_smile_cl');
    const mouth = indexOf('expr.joy', 'Mouth_happy_broad_cl');
    const executor = new MorphExecutor(binding, mesh);
    executor.apply(new Map([['eye.smile', 1]]));
    executor.clear();
    expect(mesh.influences[eyes]).toBe(0);

    mesh.influences[eyes] = 0.3;
    mesh.influences[mouth] = 0.7;
    executor.apply(new Map());
    expect(mesh.influences[eyes]).toBeCloseTo(0.3);
    expect(mesh.influences[mouth]).toBeCloseTo(0.7);
  });

  it('网格缺失或索引不匹配时降级为不可用', () => {
    const missing = new MorphExecutor(binding, null);
    expect(missing.available).toBe(false);
    expect(missing.warning).toContain('未找到');

    const mesh = makeMesh();
    mesh.dictionary.Eyes_smile_cl = 99;
    const mismatch = new MorphExecutor(binding, mesh);
    expect(mismatch.available).toBe(false);
    expect(mismatch.warning).toContain('不匹配');
    expect(mismatch.apply(new Map([['eye.smile', 1]]))).toBe(0);
  });

  it('调试快照记录通道与占用索引', () => {
    const mesh = makeMesh();
    const executor = new MorphExecutor(binding, mesh);
    const channels = new Map([['eye.smile', 0.5]]);
    executor.apply(channels);
    const snapshot = executor.snapshot(channels);
    expect(snapshot.available).toBe(true);
    expect(snapshot.channels['eye.smile']).toBe(0.5);
    expect(snapshot.written).toBeGreaterThan(0);
    expect(snapshot.activeIndices).toContain(indexOf('eye.smile', 'Eyes_smile_cl'));
  });
});

describe('VrmAnimationRuntime morph 接线', () => {
  it('attach 后可写入并按行为通道释放', () => {
    const mesh = makeMesh();
    const executor = new MorphExecutor(binding, mesh);
    const runtime = new VrmAnimationRuntime(new Map());
    runtime.attachMorph(executor);

    runtime.setMorphChannels({ 'mouth.smile': 1 });
    expect(runtime.applyMorph()).toBeGreaterThan(0);
    expect(mesh.influences[indexOf('mouth.smile', 'Mouth_smile_op')]).toBe(1);
    expect(runtime.morph?.channels['mouth.smile']).toBe(1);

    runtime.setMorphChannels(null);
    expect(runtime.applyMorph()).toBe(0);
    expect(mesh.influences[indexOf('mouth.smile', 'Mouth_smile_op')]).toBe(0);
  });
});
