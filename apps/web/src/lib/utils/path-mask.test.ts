import { describe, expect, it } from 'vitest';
import { maskWorkspacePath } from './path-mask';

describe('maskWorkspacePath（v2.14）', () => {
  it('Windows：保留盘符与末级目录', () => {
    expect(maskWorkspacePath('D:\\work\\demo')).toBe('D:\\…\\demo');
    expect(maskWorkspacePath('D:\\work')).toBe('D:\\work');
  });

  it('POSIX：保留首段与末级目录', () => {
    expect(maskWorkspacePath('/home/alice/proj')).toBe('/home/…/proj');
    expect(maskWorkspacePath('/tmp')).toBe('/tmp');
  });

  it('相对路径与单段路径原样返回', () => {
    expect(maskWorkspacePath('demo')).toBe('demo');
    expect(maskWorkspacePath('a/b')).toBe('a/b');
  });
});
