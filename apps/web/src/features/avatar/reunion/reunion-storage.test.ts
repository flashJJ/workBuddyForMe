// @vitest-environment jsdom

import { describe, expect, it, beforeEach, vi } from 'vitest';
import {
  onReunionSignal,
  pulseReunionSignal,
  readReunionMemory,
  writeReunionMemory,
} from './reunion-storage';

describe('reunion-storage（G6 跨窗口本地状态）', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('记忆写入/读取往返', () => {
    expect(readReunionMemory()).toBeNull();
    writeReunionMemory({ greetedInteractionAt: 1000, greetedAt: 2000 });
    expect(readReunionMemory()).toEqual({ greetedInteractionAt: 1000, greetedAt: 2000 });
  });

  it('损坏 JSON / 字段缺失：安全回落 null', () => {
    window.localStorage.setItem('wbfm.reunion.v1', '{not-json');
    expect(readReunionMemory()).toBeNull();
    window.localStorage.setItem('wbfm.reunion.v1', JSON.stringify({ greetedAt: 1 }));
    expect(readReunionMemory()).toBeNull();
  });

  it('前台信号只在 signal 键写入时回调', () => {
    const cb = vi.fn();
    onReunionSignal(cb);
    window.dispatchEvent(new StorageEvent('storage', { key: 'other-key' }));
    expect(cb).not.toHaveBeenCalled();
    window.dispatchEvent(new StorageEvent('storage', { key: 'wbfm.reunion.signal.v1' }));
    expect(cb).toHaveBeenCalledOnce();
  });

  it('pulseReunionSignal 写入当前时间戳', () => {
    pulseReunionSignal(12345);
    expect(window.localStorage.getItem('wbfm.reunion.signal.v1')).toBe('12345');
  });
});
