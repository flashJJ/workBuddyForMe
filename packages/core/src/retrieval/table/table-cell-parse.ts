/** v2.19 M3：Markdown 表格解析与字面匹配纯函数（table-cell 定位的底层工具） */

import { tokenizeForFts } from '@wbfm/database';

export interface ParsedMarkdownTable {
  header: string[];
  rows: string[][];
}

const CJK_RUN = /[\u4e00-\u9fff]+/g;
const ZH_DIGITS: Record<string, number> = {
  一: 1,
  二: 2,
  三: 3,
  四: 4,
  五: 5,
  六: 6,
  七: 7,
  八: 8,
  九: 9,
};

function stripOuterPipes(line: string): string {
  let body = line.trim();
  if (body.startsWith('|')) body = body.slice(1);
  if (body.endsWith('|')) body = body.slice(0, -1);
  return body;
}

function splitRow(line: string): string[] {
  return stripOuterPipes(line)
    .split('|')
    .map((cell) => cell.trim());
}

/** 分隔行：每格至少两个连字符，可带对齐冒号 */
function isSeparator(line: string): boolean {
  if (!line.trim().startsWith('|')) return false;
  const cells = stripOuterPipes(line).split('|');
  return cells.length > 0 && cells.every((cell) => /^\s*:?-{2,}:?\s*$/.test(cell));
}

/** 从分片正文提取 Markdown 表格（忽略章节前缀等非表格行） */
export function parseMarkdownTable(content: string): ParsedMarkdownTable | null {
  const lines = content
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.startsWith('|'));
  if (lines.length === 0) return null;
  const hasHeader = lines.length > 1 && isSeparator(lines[1]!);
  const header = hasHeader ? splitRow(lines[0]!) : [];
  const rows = lines
    .slice(hasHeader ? 2 : 0)
    .filter((line) => !isSeparator(line))
    .map(splitRow);
  return header.length > 0 || rows.length > 0 ? { header, rows } : null;
}

/** 列下标（0 起）→ Excel 列名：0→A，25→Z，26→AA */
export function columnLetter(index: number): string {
  let n = index + 1;
  let result = '';
  while (n > 0) {
    const rem = (n - 1) % 26;
    result = String.fromCharCode(65 + rem) + result;
    n = Math.floor((n - 1) / 26);
  }
  return result;
}

/** Excel 列名 → 列下标（0 起）；非法返回 -1 */
export function columnIndex(letters: string): number {
  let index = 0;
  for (const char of letters.toUpperCase()) {
    const code = char.charCodeAt(0);
    if (code < 65 || code > 90) return -1;
    index = index * 26 + (code - 64);
  }
  return index - 1;
}

/** 中文/阿拉伯数字（1–99，够用于「第三行」） */
export function parseCount(raw: string): number | null {
  if (/^\d+$/.test(raw)) return Number(raw);
  if (raw === '十') return 10;
  const tenAt = raw.indexOf('十');
  if (tenAt >= 0) {
    const tens = tenAt === 0 ? 1 : ZH_DIGITS[raw.slice(0, tenAt)] ?? null;
    const onesRaw = raw.slice(tenAt + 1);
    const ones = onesRaw ? ZH_DIGITS[onesRaw] ?? null : 0;
    if (tens === null || ones === null) return null;
    return tens * 10 + ones;
  }
  return ZH_DIGITS[raw] ?? null;
}

/** 查询词面：拉丁整词 + 中文 bigram/整段（单字中文噪声过大，不单独计入） */
export function queryTerms(query: string): string[] {
  const lower = query.toLowerCase();
  const terms = new Set<string>();
  for (const token of tokenizeForFts(lower)) {
    if (token.length >= 2) terms.add(token);
  }
  for (const run of lower.match(CJK_RUN) ?? []) {
    if (run.length < 2) continue;
    terms.add(run);
    for (let i = 0; i < run.length - 1; i += 1) terms.add(run.slice(i, i + 2));
  }
  return [...terms];
}

/** 标签与查询的字面匹配分；长标签/整段包含权重更高 */
export function matchScore(label: string, terms: readonly string[], queryLower: string): number {
  const normalized = label.trim().toLowerCase();
  if (!normalized) return 0;
  let score = 0;
  if (normalized.length >= 2 && queryLower.includes(normalized)) {
    score += normalized.length * 3;
  }
  for (const term of terms) {
    if (term.length >= 2 && normalized.includes(term)) score += term.length;
  }
  return score;
}

/** 唯一最高分下标；无命中或并列返回 null */
export function pickBest(scores: readonly number[]): number | null {
  let best = 0;
  let bestIndex: number | null = null;
  let tied = false;
  scores.forEach((score, index) => {
    if (score <= 0) return;
    if (score > best) {
      best = score;
      bestIndex = index;
      tied = false;
    } else if (score === best) {
      tied = true;
    }
  });
  return bestIndex !== null && !tied ? bestIndex : null;
}
