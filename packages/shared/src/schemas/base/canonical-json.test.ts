import { describe, expect, it } from 'vitest';
import { canonicalJson } from './canonical-json';

describe('canonicalJson（v2.13）', () => {
  it('键递归排序、数组保序、忽略 undefined', () => {
    expect(canonicalJson({ b: 1, a: [2, 3], z: undefined })).toBe('{"a":[2,3],"b":1}');
    expect(canonicalJson({ a: [3, 2] })).toBe('{"a":[3,2]}');
    expect(canonicalJson({ nested: { b: 1, a: 2 } })).toBe('{"nested":{"a":2,"b":1}}');
  });

  it('字符串转义与数字 / 布尔', () => {
    expect(canonicalJson('a"b\nc')).toBe('"a\\"b\\nc"');
    expect(canonicalJson(1.5)).toBe('1.5');
    expect(canonicalJson(true)).toBe('true');
    expect(canonicalJson(null)).toBe('null');
  });

  it('非有限数字抛错', () => {
    expect(() => canonicalJson(Number.NaN)).toThrow();
    expect(() => canonicalJson(Number.POSITIVE_INFINITY)).toThrow();
  });
});
