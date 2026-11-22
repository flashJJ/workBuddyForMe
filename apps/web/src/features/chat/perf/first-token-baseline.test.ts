import { describe, expect, it } from 'vitest';
import {
  FIRST_TOKEN_ABSOLUTE_LIMIT_MS,
  FIRST_TOKEN_SAMPLE_LIMIT,
  FIRST_TOKEN_SAMPLES_KEY,
  appendFirstTokenSample,
  firstTokenThreshold,
  percentile,
  readFirstTokenSamples,
} from './first-token-baseline';

function fakeStorage(initial: string | null = null) {
  let value = initial;
  return {
    getItem: (key: string) => (key === FIRST_TOKEN_SAMPLES_KEY ? value : null),
    setItem: (key: string, next: string) => {
      if (key === FIRST_TOKEN_SAMPLES_KEY) value = next;
    },
    raw: () => value,
  };
}

describe('v4.20 首字基线', () => {
  it('百分位：奇数、偶数与空数组', () => {
    expect(percentile([3000], 95)).toBe(3000);
    expect(percentile([2000, 4000], 50)).toBe(3000);
    expect(percentile([1000, 2000, 3000, 4000], 50)).toBe(2500);
    expect(percentile([], 50)).toBeNull();
    expect(percentile([-1, Number.NaN], 50)).toBeNull();
  });

  it('阈值：无基线 10s、正常 1.5 倍、慢基线封顶 10s', () => {
    expect(firstTokenThreshold([])).toBe(FIRST_TOKEN_ABSOLUTE_LIMIT_MS);
    expect(firstTokenThreshold([2000])).toBe(3000);
    expect(firstTokenThreshold([8000])).toBe(FIRST_TOKEN_ABSOLUTE_LIMIT_MS);
    expect(firstTokenThreshold([100])).toBe(150);
  });

  it('读取：损坏 JSON、非数组与非法值被丢弃', () => {
    expect(readFirstTokenSamples(fakeStorage('not json'))).toEqual([]);
    expect(readFirstTokenSamples(fakeStorage('{"a":1}'))).toEqual([]);
    expect(readFirstTokenSamples(fakeStorage('[1200,"x",-5,0,2400]'))).toEqual([1200, 2400]);
    expect(readFirstTokenSamples(null)).toEqual([]);
  });

  it('追加：保留最近 20 轮并写回存储', () => {
    const initial = Array.from({ length: FIRST_TOKEN_SAMPLE_LIMIT }, (_, index) => index + 1);
    const storage = fakeStorage(JSON.stringify(initial));
    const next = appendFirstTokenSample(storage, 999);
    expect(next).toHaveLength(FIRST_TOKEN_SAMPLE_LIMIT);
    expect(next[0]).toBe(2);
    expect(next.at(-1)).toBe(999);
    expect(JSON.parse(storage.raw() ?? '[]')).toEqual(next);
  });

  it('追加非法值不写入新样本', () => {
    const storage = fakeStorage('[1000]');
    expect(appendFirstTokenSample(storage, Number.NaN)).toEqual([1000]);
    expect(appendFirstTokenSample(storage, -3)).toEqual([1000]);
  });
});
