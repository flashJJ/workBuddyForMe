import { z } from 'zod';
import { EXPRESSION_TAGS, type ExpressionTag } from './expression';

/**
 * v1.8 角色卡契约（Markdown + YAML frontmatter 文本 mod）。
 *
 * 设计约束见 docs/plan/v1.8/02-角色卡格式与解析契约.md：
 * - 卡片是发给模型的 prompt 数据，不做模板转义/沙箱；
 * - 长度硬上限防粘贴炸弹；解析器零三方依赖（见 character-card/parser.ts）。
 */

// ── 长度/数量上限（前后端与解析器共用同一份常量） ─────────────
export const CARD_FILE_MAX_BYTES = 16 * 1024;
export const CARD_NAME_MAX_CHARS = 30;
export const CARD_DESCRIPTION_MAX_CHARS = 120;
export const CARD_VOICE_MAX_CHARS = 80;
export const CARD_IDENTITY_MAX_CHARS = 1000;
export const CARD_LIST_ITEMS_MAX = 8;
export const CARD_LIST_ITEM_MAX_CHARS = 40;

/** 卡片来源：内置只读卡 / 用户自建（含导入） */
export const CHARACTER_CARD_SOURCES = ['builtin', 'custom'] as const;
export type CharacterCardSource = (typeof CHARACTER_CARD_SOURCES)[number];

/** frontmatter（仅标量字段；未知字段忽略不报错） */
export const characterCardFrontmatterSchema = z.object({
  name: z.string().trim().min(1).max(CARD_NAME_MAX_CHARS),
  description: z.string().trim().max(CARD_DESCRIPTION_MAX_CHARS).default(''),
  defaultEmotion: z.enum(EXPRESSION_TAGS).default('neutral'),
  voice: z.string().trim().min(1).max(CARD_VOICE_MAX_CHARS).nullable().default(null),
});
export type CharacterCardFrontmatter = z.infer<typeof characterCardFrontmatterSchema>;

/** 解析后的结构化人格（列表已规范化/去重/截断） */
export const parsedCharacterCardSchema = z.object({
  name: z.string().min(1).max(CARD_NAME_MAX_CHARS),
  description: z.string().max(CARD_DESCRIPTION_MAX_CHARS),
  defaultEmotion: z.enum(EXPRESSION_TAGS),
  voice: z.string().min(1).max(CARD_VOICE_MAX_CHARS).nullable(),
  identity: z.string().max(CARD_IDENTITY_MAX_CHARS),
  traits: z.array(z.string().min(1).max(CARD_LIST_ITEM_MAX_CHARS)).max(CARD_LIST_ITEMS_MAX),
  speakingStyle: z.array(z.string().min(1).max(CARD_LIST_ITEM_MAX_CHARS)).max(CARD_LIST_ITEMS_MAX),
  boundaries: z.array(z.string().min(1).max(CARD_LIST_ITEM_MAX_CHARS)).max(CARD_LIST_ITEMS_MAX),
});
export type ParsedCharacterCard = z.infer<typeof parsedCharacterCardSchema>;

// ── 解析诊断 ────────────────────────────────────────────────
export const CHARACTER_CARD_ERROR_CODES = [
  'fileTooLarge',
  'frontmatterMissing',
  'frontmatterUnclosed',
  'frontmatterInvalid',
  'nameInvalid',
  'emotionInvalid',
] as const;
export type CharacterCardErrorCode = (typeof CHARACTER_CARD_ERROR_CODES)[number];

export const CHARACTER_CARD_WARNING_CODES = [
  'identityTruncated',
  'listItemsTruncated',
  'listItemTruncated',
  'unsupportedSectionIgnored',
] as const;
export type CharacterCardWarningCode = (typeof CHARACTER_CARD_WARNING_CODES)[number];

export interface CharacterCardDiagnostic {
  code: CharacterCardErrorCode | CharacterCardWarningCode;
  message: string;
  /** 1 起行号；无法定位为 null */
  line: number | null;
}

export type ParseCharacterCardResult =
  | { ok: true; card: ParsedCharacterCard; warnings: CharacterCardDiagnostic[] }
  | { ok: false; errors: CharacterCardDiagnostic[] };

/** 卡库持久化行（v026 character_cards 表的仓储视图） */
export const characterCardRecordSchema = z.object({
  id: z.string().min(1),
  source: z.enum(CHARACTER_CARD_SOURCES),
  name: z.string().min(1),
  description: z.string(),
  rawMarkdown: z.string().min(1),
  parsed: parsedCharacterCardSchema,
  defaultEmotion: z.enum(EXPRESSION_TAGS),
  voice: z.string().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type CharacterCardRecord = z.infer<typeof characterCardRecordSchema>;

export type { ExpressionTag };
