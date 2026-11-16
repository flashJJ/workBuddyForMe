// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { AUDIO_MUTED_STORAGE_KEY } from './constants';
import { AudioDirector } from './director';

afterEach(() => {
  window.localStorage.clear();
});

describe('v4.2 静音持久化', () => {
  it('写入 localStorage，新实例可恢复', () => {
    const first = new AudioDirector();
    expect(first.muted).toBe(false);
    first.setMuted(true);
    expect(window.localStorage.getItem(AUDIO_MUTED_STORAGE_KEY)).toBe('1');

    const second = new AudioDirector();
    expect(second.muted).toBe(true);
    second.setMuted(false);
    expect(window.localStorage.getItem(AUDIO_MUTED_STORAGE_KEY)).toBe('0');
  });
});
