import { describe, expect, it } from 'vitest';
import animeartBinding from '../../bindings/animeart-v1.json';
import { MorphBindingError, buildMorphBinding } from '../../binding';

describe('MorphBinding', () => {
  const binding = buildMorphBinding(animeartBinding);

  it('AnimeArt 家族 binding 可加载：118 个 target、13 组标准表情', () => {
    expect(binding.definition.family).toBe('animeart-v1');
    expect(binding.definition.morphCount).toBe(118);
    expect(binding.definition.targets).toHaveLength(118);
    expect(binding.nameToIndex.size).toBe(118);
    expect(Object.keys(binding.definition.standardExpressions)).toHaveLength(13);
  });

  it('语义通道可解析到模型 morph，未知通道返回 null', () => {
    expect(binding.resolve('expr.joy')?.map((target) => target.name)).toEqual([
      'Eyes_smile_cl',
      'Mouth_happy_broad_cl',
      'Eyebrows_smug_cl',
    ]);
    expect(binding.resolve('eye.smile')?.[0]?.name).toBe('Eyes_smile_cl');
    expect(binding.resolve('gaze.left')?.[0]?.name).toBe('Eye_look_left');
    expect(binding.resolve('not.exist')).toBeNull();
  });

  it('标准表情绑定保留 VRM 索引与名称', () => {
    const joy = binding.definition.standardExpressions.Joy ?? [];
    expect(joy).toHaveLength(3);
    for (const target of joy) {
      expect(binding.definition.targets[target.index]?.name).toBe(target.name);
    }
  });

  it('blink / viseme 为保留通道，行为通道不可使用', () => {
    expect(binding.isReserved('blink')).toBe(true);
    expect(binding.isReserved('blink.left')).toBe(true);
    expect(binding.isReserved('viseme.a')).toBe(true);
    expect(binding.isReserved('eye.smile')).toBe(false);
  });

  it('结构错误会抛出 MorphBindingError', () => {
    expect(() => buildMorphBinding({ ...animeartBinding, schema: 2 })).toThrow(MorphBindingError);
    expect(() =>
      buildMorphBinding({
        ...animeartBinding,
        targets: [...animeartBinding.targets, animeartBinding.targets[0]],
      }),
    ).toThrow(MorphBindingError);
    expect(() =>
      buildMorphBinding({
        ...animeartBinding,
        channels: {
          ...animeartBinding.channels,
          'eye.smile': [{ index: 0, name: 'Wrong_name', scale: 1 }],
        },
      }),
    ).toThrow(MorphBindingError);
    expect(() =>
      buildMorphBinding({
        ...animeartBinding,
        channels: {
          ...animeartBinding.channels,
          'blink.extra': [{ index: 0, name: animeartBinding.targets[0]?.name ?? '', scale: 1 }],
        },
      }),
    ).toThrow(MorphBindingError);
  });
});
