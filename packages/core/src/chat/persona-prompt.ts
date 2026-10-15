import type { CardNicknameByLevel, ParsedCharacterCard } from '@wbfm/shared/character-card';

/**
 * v1.8 身份卡段落：由解析结构按固定小节序重组
 * （identity → 性格特征 → 说话风格 → 边界，契约见 docs/plan/v1.8/02 第 5 节）。
 * 文案保持用户原文（规范化/截断在解析期完成）；缺失章节整体省略；全空返回 null。
 *
 * v2.0：unlockedNickname 存在时追加「对用户的称呼」段（关系等级解锁闸门在
 * 组装前拦截，未解锁称呼永不入 prompt，见 resolveUnlockedNickname）。
 */

/**
 * v2.0 等级称呼解锁纯函数（03 契约 §7.1/§7.3）：
 * 展示等级为 L 时，取 nicknameByLevel[L]；该档缺省则回落已解锁的最近低档；
 * 都没有（或陌生档 0）返回 null=不注入（模型自然回落卡名/助手名）。
 */
export function resolveUnlockedNickname(
  nicknameByLevel: CardNicknameByLevel | undefined,
  displayLevel: number,
): string | null {
  if (!nicknameByLevel || displayLevel < 1) return null;
  for (let level = Math.min(3, Math.floor(displayLevel)); level >= 1; level -= 1) {
    const nickname = nicknameByLevel[level as 1 | 2 | 3];
    if (nickname) return nickname;
  }
  return null;
}

function nicknameSection(nickname: string): string {
  return [
    '【对用户的称呼】',
    `你对用户的专属称呼是「${nickname}」。对话中自然地使用这个称呼；`,
    '不要解释称呼的由来，也不要生硬地反复使用。',
  ].join('');
}

export function buildPersonaBlock(
  card: ParsedCharacterCard,
  unlockedNickname?: string | null,
): string | null {
  const sections: string[] = [];
  if (card.identity.trim()) sections.push(card.identity.trim());

  const pushList = (title: string, items: string[]): void => {
    if (items.length === 0) return;
    sections.push(`${title}：\n${items.map((item) => `- ${item}`).join('\n')}`);
  };
  pushList('性格特征', card.traits);
  pushList('说话风格', card.speakingStyle);
  pushList('边界', card.boundaries);

  // v2.0：仅已解锁称呼入段（调用方经 resolveUnlockedNickname 闸门计算）
  if (unlockedNickname?.trim()) sections.push(nicknameSection(unlockedNickname.trim()));

  if (sections.length === 0) return null;
  return `【角色卡】\n${sections.join('\n\n')}`;
}
