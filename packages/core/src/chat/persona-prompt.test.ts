import { describe, expect, it } from 'vitest';
import type { ParsedCharacterCard } from '@wbfm/shared/character-card';
import { buildPersonaBlock, resolveUnlockedNickname } from './persona-prompt';

const baseCard: ParsedCharacterCard = {
  name: '小伴',
  description: '',
  defaultEmotion: 'neutral',
  voice: null,
  identity: '我是你的桌面伙伴。',
  traits: ['直率'],
  speakingStyle: [],
  boundaries: [],
};

describe('v2.0 等级称呼解锁闸门 resolveUnlockedNickname', () => {
  it('陌生档（0）/未配置称呼 → null（不注入）', () => {
    expect(resolveUnlockedNickname({ 2: '老板' }, 0)).toBeNull();
    expect(resolveUnlockedNickname(undefined, 3)).toBeNull();
    expect(resolveUnlockedNickname({}, 2)).toBeNull();
  });

  it('当前档有配置取当前档；缺省回落已解锁的最近低档（高档称呼不提前泄露）', () => {
    const map = { 1: '你', 3: '死党' } as const;
    expect(resolveUnlockedNickname(map, 1)).toBe('你');
    expect(resolveUnlockedNickname(map, 2)).toBe('你'); // 搭档档未配，回落认识档
    expect(resolveUnlockedNickname(map, 3)).toBe('死党');
    // 等级 2 时绝不能拿到挚友档称呼
    expect(resolveUnlockedNickname({ 3: '死党' }, 2)).toBeNull();
  });
});

describe('buildPersonaBlock v2.0 称呼段', () => {
  it('未解锁称呼时形状与 v1.8 完全一致（无称呼段）', () => {
    expect(buildPersonaBlock(baseCard)).toBe('【角色卡】\n我是你的桌面伙伴。\n\n性格特征：\n- 直率');
    expect(buildPersonaBlock(baseCard, null)).toBe(buildPersonaBlock(baseCard));
  });

  it('已解锁称呼追加在末尾，且文案含称呼原文', () => {
    const block = buildPersonaBlock(baseCard, '老板');
    expect(block).toContain('【对用户的称呼】');
    expect(block).toContain('「老板」');
    // 称呼段在性格特征之后
    expect(block!.indexOf('性格特征')).toBeLessThan(block!.indexOf('对用户的称呼'));
  });

  it('空白称呼被忽略，不产生空段落', () => {
    const block = buildPersonaBlock(baseCard, '   ');
    expect(block).not.toContain('对用户的称呼');
  });
});
