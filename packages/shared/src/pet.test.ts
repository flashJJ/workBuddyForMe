import { describe, expect, it } from 'vitest';
import { SUPPORTED_AVATAR_MODEL_IDS } from './schemas/voice';
import { PET_SUBTITLE_MAX, normalizeAvatarModelId, sanitizePetEvent } from './pet';

describe('normalizeAvatarModelId', () => {
  it('白名单内 id 原样返回', () => {
    for (const id of SUPPORTED_AVATAR_MODEL_IDS) {
      expect(normalizeAvatarModelId(id)).toBe(id);
    }
  });

  it('v2.0：vrm: 前缀动态 id 原样放行（白名单无法枚举用户导入的 VRM）', () => {
    expect(normalizeAvatarModelId('vrm:abc123.vrm')).toBe('vrm:abc123.vrm');
    expect(normalizeAvatarModelId('vrm:')).toBe('vrm:');
    expect(normalizeAvatarModelId('vrm:中文角色.vrm')).toBe('vrm:中文角色.vrm');
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

  it('v2.2 relationship：等级夹紧 0–3，档位必须在词表内', () => {
    expect(sanitizePetEvent({ kind: 'relationship', level: 2, mood: 'good' })).toEqual({
      kind: 'relationship',
      level: 2,
      mood: 'good',
    });
    expect(sanitizePetEvent({ kind: 'relationship', level: 9, mood: 'normal' })).toEqual({
      kind: 'relationship',
      level: 3,
      mood: 'normal',
    });
    expect(sanitizePetEvent({ kind: 'relationship', level: -5, mood: 'low' })).toEqual({
      kind: 'relationship',
      level: 0,
      mood: 'low',
    });
    expect(sanitizePetEvent({ kind: 'relationship', level: 1.6, mood: 'low' })).toEqual({
      kind: 'relationship',
      level: 2,
      mood: 'low',
    });
    // 词表外档位 / 缺档位 / 非有限等级一律丢弃
    expect(sanitizePetEvent({ kind: 'relationship', level: 1, mood: 'angry' })).toBeNull();
    expect(sanitizePetEvent({ kind: 'relationship', level: 1 })).toBeNull();
    expect(sanitizePetEvent({ kind: 'relationship', level: NaN, mood: 'good' })).toBeNull();
  });

  it('v2.3 interaction：四类事件放行（仅保留枚举内字段）', () => {
    // durationMs 不在契约内 → 净化后丢弃
    expect(
      sanitizePetEvent({
        kind: 'interaction',
        event: { kind: 'touch', region: 'head', gesture: 'tap', durationMs: 300 },
      }),
    ).toEqual({ kind: 'interaction', event: { kind: 'touch', region: 'head', gesture: 'tap' } });
    expect(
      sanitizePetEvent({ kind: 'interaction', event: { kind: 'context', trigger: 'lateNight' } }),
    ).toEqual({ kind: 'interaction', event: { kind: 'context', trigger: 'lateNight' } });
    expect(
      sanitizePetEvent({ kind: 'interaction', event: { kind: 'system', signal: 'voice-end' } }),
    ).toEqual({ kind: 'interaction', event: { kind: 'system', signal: 'voice-end' } });
    expect(
      sanitizePetEvent({
        kind: 'interaction',
        event: { kind: 'relationship', level: 'partner', delta: 1 },
      }),
    ).toEqual({ kind: 'interaction', event: { kind: 'relationship', level: 'partner', delta: 1 } });
  });

  it('v2.3 interaction：枚举外取值 / 对话事件 / 缺 event 一律丢弃', () => {
    expect(
      sanitizePetEvent({ kind: 'interaction', event: { kind: 'touch', region: 'tail', gesture: 'tap' } }),
    ).toBeNull();
    expect(
      sanitizePetEvent({ kind: 'interaction', event: { kind: 'system', signal: 'reboot' } }),
    ).toBeNull();
    expect(
      sanitizePetEvent({
        kind: 'interaction',
        event: { kind: 'relationship', level: 'boss', delta: 1 },
      }),
    ).toBeNull();
    expect(
      sanitizePetEvent({ kind: 'interaction', event: { kind: 'chat', subtype: 'mention' } }),
    ).toBeNull();
    expect(sanitizePetEvent({ kind: 'interaction' })).toBeNull();
  });
});
