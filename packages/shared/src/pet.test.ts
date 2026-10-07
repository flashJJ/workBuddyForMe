import { describe, expect, it } from 'vitest';
import { SUPPORTED_AVATAR_MODEL_IDS } from './schemas/voice';
import { PET_SUBTITLE_MAX, normalizeAvatarModelId, sanitizePetEvent } from './pet';

describe('normalizeAvatarModelId', () => {
  it('白名单内 id 原样返回', () => {
    for (const id of SUPPORTED_AVATAR_MODEL_IDS) {
      expect(normalizeAvatarModelId(id)).toBe(id);
    }
  });

  it('空值/未知 id/非字符串回落 haru', () => {
    expect(normalizeAvatarModelId(undefined)).toBe('haru');
    expect(normalizeAvatarModelId(null)).toBe('haru');
    expect(normalizeAvatarModelId('')).toBe('haru');
    expect(normalizeAvatarModelId('evil-model')).toBe('haru');
    expect(normalizeAvatarModelId(42)).toBe('haru');
    expect(normalizeAvatarModelId({ toString: () => 'haru' })).toBe('haru');
  });
});

describe('sanitizePetEvent IPC 载荷净化', () => {
  it('合法事件原样（level 钳到 0~1）', () => {
    expect(sanitizePetEvent({ kind: 'level', value: 0.42 })).toEqual({
      kind: 'level',
      value: 0.42,
    });
    expect(sanitizePetEvent({ kind: 'level', value: 9 })).toEqual({ kind: 'level', value: 1 });
    expect(sanitizePetEvent({ kind: 'level', value: -3 })).toEqual({ kind: 'level', value: 0 });
    expect(sanitizePetEvent({ kind: 'state', state: 'listening' })).toEqual({
      kind: 'state',
      state: 'listening',
    });
    expect(sanitizePetEvent({ kind: 'conversation' })).toEqual({ kind: 'conversation' });
  });

  it('字幕截断到 PET_SUBTITLE_MAX，表情必须在 8 标签内', () => {
    const long = '字'.repeat(PET_SUBTITLE_MAX + 50);
    const got = sanitizePetEvent({ kind: 'subtitle', text: long });
    expect(got).toEqual({ kind: 'subtitle', text: '字'.repeat(PET_SUBTITLE_MAX) });

    expect(sanitizePetEvent({ kind: 'expression', tag: 'joy' })).toEqual({
      kind: 'expression',
      tag: 'joy',
    });
    expect(sanitizePetEvent({ kind: 'expression', tag: 'script:alert(1)' })).toBeNull();
  });

  it('非法结构/未知 kind/类型错误全部丢弃', () => {
    expect(sanitizePetEvent(null)).toBeNull();
    expect(sanitizePetEvent('x')).toBeNull();
    expect(sanitizePetEvent({})).toBeNull();
    expect(sanitizePetEvent({ kind: 'level', value: NaN })).toBeNull();
    expect(sanitizePetEvent({ kind: 'state', state: 'sleeping' })).toBeNull();
    expect(sanitizePetEvent({ kind: 'subtitle', text: 1 })).toBeNull();
    expect(sanitizePetEvent({ kind: 'exec', cmd: 'calc' })).toBeNull();
  });
});
