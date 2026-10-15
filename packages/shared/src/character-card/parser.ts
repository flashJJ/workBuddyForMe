/**
 * v1.8 角色卡 Markdown 解析器（纯函数、零三方依赖）。
 *
 * 输入一份 .md 文本：YAML-ish frontmatter（仅 4 个标量字段）+ 约定二级章节。
 * 输出判别联合 ParseCharacterCardResult（契约见 schemas/character-card.ts）。
 * 刻意不引入 gray-matter/yaml 包：字段封闭且只支持标量，手写解析消除 YAML 攻击面与依赖体积。
 * 行号一律 1 起、按物理行计数，便于 UI 定位错误。
 */
import {
  CARD_FILE_MAX_BYTES,
  CARD_IDENTITY_MAX_CHARS,
  CARD_LIST_ITEM_MAX_CHARS,
  CARD_LIST_ITEMS_MAX,
  CARD_NAME_MAX_CHARS,
  type CardNicknameByLevel,
  type CharacterCardDiagnostic,
  type ParseCharacterCardResult,
  type ParsedCharacterCard,
} from '../schemas/character-card';
import { EXPRESSION_TAGS } from '../schemas/expression';
import { parseFrontmatter, type RawFrontmatter } from './parser-frontmatter';

type SectionKey = 'identity' | 'traits' | 'speakingStyle' | 'boundaries';

/** 规范章节标题别名（trim/去冒号后精确匹配，不做模糊包含） */
const SECTION_ALIASES: Record<string, SectionKey> = {
  我是谁: 'identity',
  身份: 'identity',
  性格特征: 'traits',
  说话风格: 'speakingStyle',
  边界: 'boundaries',
};

function err(
  code: CharacterCardDiagnostic['code'],
  message: string,
  line: number | null,
): CharacterCardDiagnostic {
  return { code, message, line };
}

function utf8Bytes(s: string): number {
  return new TextEncoder().encode(s).length;
}

/** 标题归一：去 2-3 个前导 #、首尾空白、末尾中英文冒号 */
function normalizeHeading(raw: string): string {
  return raw
    .replace(/^#{2,3}\s*/, '')
    .trim()
    .replace(/[:：]$/, '')
    .trim();
}

interface SectionBlock {
  key: SectionKey;
  headingLine: number;
  bodyLines: string[];
}

/** 列表项去标记并 trim；非列表行返回 null */
function toBullet(line: string): string | null {
  const m = /^\s*[-*+]\s+(.+?)\s*$/.exec(line);
  return m && m[1] !== undefined ? m[1].trim() : null;
}

/** 列表规范化：去标记/去重（保首次出现）/超条截断/超长截断，附带告警 */
function normalizeList(block: SectionBlock, warnings: CharacterCardDiagnostic[]): string[] {
  const items: string[] = [];
  block.bodyLines.forEach((line, i) => {
    const bullet = toBullet(line);
    if (bullet === null) return;
    if (items.length >= CARD_LIST_ITEMS_MAX) return;
    let item = bullet;
    if (item.length > CARD_LIST_ITEM_MAX_CHARS) {
      item = item.slice(0, CARD_LIST_ITEM_MAX_CHARS);
      warnings.push(
        err('listItemTruncated', `条目超过 ${CARD_LIST_ITEM_MAX_CHARS} 字符，已截断`, block.headingLine + i + 1),
      );
    }
    if (!items.includes(item)) items.push(item);
  });
  const rawCount = block.bodyLines.filter((l) => toBullet(l) !== null).length;
  if (rawCount > CARD_LIST_ITEMS_MAX) {
    warnings.push(
      err('listItemsTruncated', `超过 ${CARD_LIST_ITEMS_MAX} 条，仅保留前 ${CARD_LIST_ITEMS_MAX} 条`, block.headingLine),
    );
  }
  return items;
}

/** identity 段落：软换行合并为空格，空行分段；超长截断 */
function normalizeIdentity(block: SectionBlock, warnings: CharacterCardDiagnostic[]): string {
  const paragraphs: string[] = [];
  let buf: string[] = [];
  const flush = () => {
    if (buf.length) paragraphs.push(buf.join(' '));
    buf = [];
  };
  for (const line of block.bodyLines) {
    if (!line.trim()) {
      flush();
    } else {
      buf.push(line.trim());
    }
  }
  flush();
  let text = paragraphs.join('\n\n').trim();
  if (text.length > CARD_IDENTITY_MAX_CHARS) {
    text = text.slice(0, CARD_IDENTITY_MAX_CHARS);
    warnings.push(
      err('identityTruncated', `“我是谁”超过 ${CARD_IDENTITY_MAX_CHARS} 字符，已截断`, block.headingLine),
    );
  }
  return text;
}

export function parseCharacterCard(markdown: string): ParseCharacterCardResult {
  // 统一换行（CRLF -> LF），行号按物理行计
  const text = markdown.replace(/\r\n?/g, '\n');
  if (utf8Bytes(text) > CARD_FILE_MAX_BYTES) {
    return {
      ok: false,
      errors: [err('fileTooLarge', `角色卡不能超过 ${CARD_FILE_MAX_BYTES / 1024}KB`, 1)],
    };
  }

  const lines = text.split('\n');
  // frontmatter：首行必须是 ---
  if (lines[0]?.trim() !== '---') {
    return { ok: false, errors: [err('frontmatterMissing', '文件必须以 --- 开头的 frontmatter 开始', 1)] };
  }
  const closeIdx = lines.slice(1).findIndex((l) => l.trim() === '---');
  if (closeIdx === -1) {
    return { ok: false, errors: [err('frontmatterUnclosed', 'frontmatter 缺少结束分隔符 ---', null)] };
  }
  const closeLine = closeIdx + 1; // 物理行号（0 基索引=closeIdx+1）
  const fmLines = lines.slice(1, closeLine);
  const parsed = parseFrontmatter(fmLines, 1);

  const errors: CharacterCardDiagnostic[] = [];
  let fm: RawFrontmatter;
  if (Array.isArray(parsed)) {
    errors.push(...parsed);
    fm = {};
  } else {
    fm = parsed;
    if (!fm.name || !fm.name.trim()) {
      errors.push(err('nameInvalid', 'frontmatter 缺少非空 name 字段', fmLines.length ? 2 : 1));
    } else if (fm.name.trim().length > CARD_NAME_MAX_CHARS) {
      errors.push(err('nameInvalid', `name 不能超过 ${CARD_NAME_MAX_CHARS} 字符`, null));
    }
    if (fm.defaultEmotion !== undefined && !EXPRESSION_TAGS.includes(fm.defaultEmotion as never)) {
      errors.push(err('emotionInvalid', `defaultEmotion 必须是：${EXPRESSION_TAGS.join('/')}`, null));
    }
  }
  if (errors.length) return { ok: false, errors };

  // 章节切分
  const body = lines.slice(closeLine + 1);
  const blocks: SectionBlock[] = [];
  const warnings: CharacterCardDiagnostic[] = [];
  let current: SectionBlock | null = null;
  body.forEach((line, i) => {
    const physicalLine = closeLine + 2 + i;
    const hm = /^(#{2,3})\s+\S/.test(line) ? line : null;
    if (hm) {
      const key = SECTION_ALIASES[normalizeHeading(line)];
      if (key) {
        current = { key, headingLine: physicalLine, bodyLines: [] };
        blocks.push(current);
      } else if (/^#{2,3}\s+/.test(line)) {
        warnings.push(err('unsupportedSectionIgnored', `未识别的章节“${normalizeHeading(line)}”已忽略`, physicalLine));
        current = null;
      }
      return;
    }
    if (line.startsWith('#')) {
      // # 一级或更多 # 的非约定标题：不当章节也不告警，正文忽略其标题效应
      current = null;
      return;
    }
    current?.bodyLines.push(line);
  });

  const card: ParsedCharacterCard = {
    name: fm.name!.trim(),
    description: (fm.description ?? '').trim(),
    defaultEmotion: (fm.defaultEmotion as ParsedCharacterCard['defaultEmotion']) ?? 'neutral',
    voice: fm.voice ? fm.voice.trim() : null,
    identity: '',
    traits: [],
    speakingStyle: [],
    boundaries: [],
  };
  // v2.0：稀疏等级称呼（仅收集非空档；解析期已做长度校验）
  const nicknameByLevel: CardNicknameByLevel = {};
  (
    [
      [1, fm.nickname1],
      [2, fm.nickname2],
      [3, fm.nickname3],
    ] as const
  ).forEach(([level, raw]) => {
    const value = raw?.trim();
    if (value) nicknameByLevel[level] = value;
  });
  if (Object.keys(nicknameByLevel).length > 0) card.nicknameByLevel = nicknameByLevel;
  for (const block of blocks) {
    if (block.key === 'identity') card.identity = normalizeIdentity(block, warnings);
    else card[block.key] = normalizeList(block, warnings);
  }
  return { ok: true, card, warnings };
}
