import {
  MIGRATED_CARD_NAME,
  parseCharacterCard,
  type CharacterCardRecord,
  type ParsedCharacterCard,
} from '@wbfm/shared/character-card';
import { createCharacterCardRepository, type DatabaseInstance } from '@wbfm/database';

/**
 * v1.8：旧 systemPrompt（与「直接写提示词原文」编辑模式）包装为仅含 identity 的自建卡。
 * 原文逐字放进「我是谁」章节——不 trim、不改写一字；parsed 结构受角色卡契约约束。
 */
export function buildIdentityCardMarkdown(systemPrompt: string): string {
  return `---\nname: ${MIGRATED_CARD_NAME}\n---\n\n## 我是谁\n\n${systemPrompt}\n`;
}

/**
 * 迁移/包装路径的解析：输入均为已通过助手 schema 的合法提示词（≤8000 字），
 * 再解析失败属于程序不变量破裂，直接抛错而非静默截断人格。
 */
export function parseWrappedPrompt(rawMarkdown: string, context: string): ParsedCharacterCard {
  const result = parseCharacterCard(rawMarkdown);
  if (!result.ok) {
    const detail = result.errors.map((e) => `第${e.line ?? '?'}行 ${e.message}`).join('；');
    throw new Error(`${context}角色卡包装失败：${detail}`);
  }
  return result.card;
}

/** 由提示词原文创建一张 custom 卡（调用方负责把 card.id 回写助手） */
export function createIdentityCard(db: DatabaseInstance, systemPrompt: string): CharacterCardRecord {
  const rawMarkdown = buildIdentityCardMarkdown(systemPrompt);
  const parsed = parseWrappedPrompt(rawMarkdown, '提示词迁移');
  return createCharacterCardRepository(db).create({ source: 'custom', rawMarkdown, parsed });
}
