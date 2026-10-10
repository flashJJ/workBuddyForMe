/**
 * 句子级文本单元切分（v1.3 M2，纯函数）。
 *
 * 知识编译器（规则摘要选原句、实体 mention 定位）都需要「带字符偏移的句子」。
 * 与 ingestion/chunking 的分片不同：这里按句末标点切最小句子单位，不做贪心打包，
 * 偏移相对输入原文（调用方传入的 chunk 文本为局部坐标，需自行加 chunk 基偏移）。
 */

export interface TextSpan {
  /** 句子文本（已 trim，不含句末标点之外的空白） */
  text: string;
  /** 在原文中的起始字符偏移 */
  start: number;
  /** 排他性结束偏移（slice(start,end) 即该句，含句末标点） */
  end: number;
}

/**
 * 句末标点：中文 。！？；与英文 . ! ? ;，保留标点在句内。
 * 省略号/小数点不特殊处理（启发式规则可接受偶发误切，实体/摘要只取高置信结果）。
 */
const SENTENCE_END = /[。！？!?；;]/;

const TITLE_LIKE = /^(第[一二三四五六七八九十百千0-9]+[章节条款]|[0-9]+(\.[0-9]+)*[、.．])/;

/** 判断句子是否像标题/目录噪声（短、以章节序号开头且无句末标点） */
export function isTitleLike(sentence: string): boolean {
  const trimmed = sentence.trim();
  if (!trimmed) return true;
  // 纯章节序号且很短视为标题噪声
  if (TITLE_LIKE.test(trimmed) && trimmed.length <= 24 && !SENTENCE_END.test(trimmed)) {
    return true;
  }
  return false;
}

/**
 * 切句：扫描句末标点，标点后即断句；连续标点合并到同句。
 * 换行也作为弱断句（PDF 提取的行文本常无句末标点），由 breakOnNewline 控制。
 */
export function splitSentences(
  text: string,
  options: { breakOnNewline?: boolean } = {},
): TextSpan[] {
  const breakOnNewline = options.breakOnNewline ?? true;
  const spans: TextSpan[] = [];
  let start = 0;
  let trimmedStart = -1;

  const flush = (endExclusive: number) => {
    if (trimmedStart === -1) {
      start = endExclusive;
      return;
    }
    const raw = text.slice(start, endExclusive);
    const lead = raw.length - raw.trimStart().length;
    const tail = raw.trimEnd().length;
    const s = raw.slice(lead, lead + tail).trim();
    if (s) spans.push({ text: s, start: start + lead, end: start + lead + tail });
    start = endExclusive;
    trimmedStart = -1;
  };

  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i]!;
    if (ch.trim() && trimmedStart === -1) trimmedStart = i;
    if (SENTENCE_END.test(ch)) {
      flush(i + 1);
    } else if (breakOnNewline && ch === '\n') {
      flush(i + 1);
    }
  }
  flush(text.length);
  return spans;
}

/** 句子是否包含「定义/包含」类动词信号（规则摘要/实体抽取用） */
const DEFINITION_VERBS = /(是|指|包括|包含|分为|组成|兼容|支持|称为|简称|即|means?|is\s|refers?\s+to|consists?\s+of|supports?)/i;

export function hasDefinitionSignal(sentence: string): boolean {
  return DEFINITION_VERBS.test(sentence);
}
