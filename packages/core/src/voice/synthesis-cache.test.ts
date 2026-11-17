import { describe, expect, it } from 'vitest';
import { SynthesisCache, synthesisCacheKey } from './synthesis-cache';

function result(samples: number[]) {
  return { samples: new Float32Array(samples), sampleRate: 24000 };
}

describe('SynthesisCache', () => {
  it('命中返回副本，调用方修改不影响缓存', () => {
    const cache = new SynthesisCache();
    const key = synthesisCacheKey('kokoro', 18, 1, '你好');
    cache.set(key, result([0.1, 0.2]), '你好');

    const first = cache.get(key);
    expect(first?.samples.length).toBe(2);
    first!.samples[0] = 9;

    const second = cache.get(key);
    expect(second?.samples[0]).toBeCloseTo(0.1);
  });

  it('按条数淘汰最久未使用项', () => {
    const cache = new SynthesisCache({ maxEntries: 2 });
    cache.set('a', result([1]), 'a');
    cache.set('b', result([2]), 'b');
    expect(cache.get('a')).not.toBeNull();
    cache.set('c', result([3]), 'c');

    expect(cache.size).toBe(2);
    expect(cache.get('a')).not.toBeNull();
    expect(cache.get('b')).toBeNull();
    expect(cache.get('c')).not.toBeNull();
  });

  it('长文/空文本/空音频不缓存', () => {
    const cache = new SynthesisCache({ maxTextLength: 4 });
    cache.set('long', result([1]), '超过四个字');
    cache.set('empty-text', result([1]), '   ');
    cache.set('empty-audio', result([]), '你好');

    expect(cache.get('long')).toBeNull();
    expect(cache.get('empty-text')).toBeNull();
    expect(cache.get('empty-audio')).toBeNull();
    expect(cache.size).toBe(0);
  });

  it('PCM 样本总量超限时淘汰旧项；clear 清空', () => {
    const cache = new SynthesisCache({ maxEntries: 10, maxSamples: 3 });
    cache.set('a', result([1, 2]), 'a');
    cache.set('b', result([3, 4]), 'b');

    expect(cache.get('a')).toBeNull();
    expect(cache.get('b')).not.toBeNull();

    cache.clear();
    expect(cache.size).toBe(0);
    expect(cache.get('b')).toBeNull();
  });
});
