import { describe, expect, it } from 'vitest';
import { cn } from './utils';

describe('cn 类名合并', () => {
  it('拼接多段类名', () => {
    expect(cn('a', 'b', ['c', 'd'])).toContain('a');
    expect(cn('a', 'b', ['c', 'd'])).toContain('d');
  });

  it('tailwind 冲突类后者覆盖前者', () => {
    expect(cn('px-2', 'px-4')).toBe('px-4');
  });

  it('过滤假值', () => {
    expect(cn('a', undefined, false && 'b', null, 'c')).toBe('a c');
  });
});
