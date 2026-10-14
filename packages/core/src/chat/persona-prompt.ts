import type { ParsedCharacterCard } from '@wbfm/shared/character-card';

/**
 * v1.8 身份卡段落：由解析结构按固定小节序重组
 * （identity → 性格特征 → 说话风格 → 边界，契约见 docs/plan/v1.8/02 第 5 节）。
 * 文案保持用户原文（规范化/截断在解析期完成）；缺失章节整体省略；全空返回 null。
 */
export function buildPersonaBlock(card: ParsedCharacterCard): string | null {
  const sections: string[] = [];
  if (card.identity.trim()) sections.push(card.identity.trim());

  const pushList = (title: string, items: string[]): void => {
    if (items.length === 0) return;
    sections.push(`${title}：\n${items.map((item) => `- ${item}`).join('\n')}`);
  };
  pushList('性格特征', card.traits);
  pushList('说话风格', card.speakingStyle);
  pushList('边界', card.boundaries);

  if (sections.length === 0) return null;
  return `【角色卡】\n${sections.join('\n\n')}`;
}
