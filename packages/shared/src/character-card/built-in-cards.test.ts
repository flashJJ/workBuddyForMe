import { describe, expect, it } from 'vitest';
import {
  BUILTIN_CARD_SEEDS,
  BUILTIN_CARD_CAPABLE_COLLEAGUE,
  BUILTIN_CARD_CHEERFUL_BUDDY,
  BUILTIN_CARD_CALM_ADVISOR,
  BUILTIN_CARD_WARM_COMPANION,
  BUILTIN_CARD_RESEARCH_SCOUT,
  BUILTIN_CARD_STUDY_COACH,
} from './built-in-cards';
import { parseCharacterCard } from './parser';
import { EXPRESSION_TAGS } from '../schemas/expression';

describe('v1.8 内置角色卡播种契约', () => {
  it('不少于 3 张且 id 唯一', () => {
    expect(BUILTIN_CARD_SEEDS.length).toBeGreaterThanOrEqual(3);
    expect(new Set(BUILTIN_CARD_SEEDS.map((s) => s.id)).size).toBe(BUILTIN_CARD_SEEDS.length);
  });

  it.each(BUILTIN_CARD_SEEDS.map((seed) => [seed.id, seed.rawMarkdown] as const))(
    '%s：零错误零告警解析，四章节齐全，情绪标签合法',
    (id, rawMarkdown) => {
      const result = parseCharacterCard(rawMarkdown);
      expect(result.ok).toBe(true);
      if (!result.ok) throw new Error(result.errors.map((e) => e.message).join('；'));
      expect(result.warnings).toEqual([]);
      expect(result.card.name.trim().length).toBeGreaterThan(0);
      expect(result.card.identity.length).toBeGreaterThan(0);
      expect(result.card.traits.length).toBeGreaterThan(0);
      expect(result.card.speakingStyle.length).toBeGreaterThan(0);
      expect(result.card.boundaries.length).toBeGreaterThan(0);
      expect(EXPRESSION_TAGS).toContain(result.card.defaultEmotion);
      expect(id).toBeTruthy();
    },
  );

  it('6 张预设卡覆盖职场/陪伴/顾问/情感/调研/学习场景', () => {
    expect(
      [
        BUILTIN_CARD_CAPABLE_COLLEAGUE,
        BUILTIN_CARD_CHEERFUL_BUDDY,
        BUILTIN_CARD_CALM_ADVISOR,
        BUILTIN_CARD_WARM_COMPANION,
        BUILTIN_CARD_RESEARCH_SCOUT,
        BUILTIN_CARD_STUDY_COACH,
      ].map((c) => c.id),
    ).toEqual(BUILTIN_CARD_SEEDS.map((s) => s.id));
    expect(BUILTIN_CARD_WARM_COMPANION.rawMarkdown).toContain('暖心伙伴');
    expect(BUILTIN_CARD_RESEARCH_SCOUT.rawMarkdown).toContain('调研搭档');
    expect(BUILTIN_CARD_STUDY_COACH.rawMarkdown).toContain('学习教练');
  });
});
