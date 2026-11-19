import type { SummaryPayload } from '@wbfm/shared/schemas';

/**
 * v2.26 P1 摘要保真校验：
 * 折叠原文中的数字与日期是后续对话最易丢失、也最不该丢的信息。
 * 摘要完成后核对「原文出现的数字/日期」是否仍出现在结构化结果中，
 * 缺失项用于触发一次重试；重试仍失败则把原文片段追加到摘要末尾。
 */

const FULL_WIDTH_DIGITS = /[\uFF10-\uFF19]/g;

/** 全角数字转半角，供比对与抽取共用 */
function toHalfWidth(text: string): string {
  return text.replace(FULL_WIDTH_DIGITS, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0xfee0));
}

/** 归一化日期/数字写法，减少「2026年3月1日 vs 2026-03-01」式误报 */
export function normalizeForFidelity(text: string): string {
  return toHalfWidth(text)
    .replace(/[／/]/g, '-')
    .replace(/(\d{4})\.(\d{1,2})\.(\d{1,2})/g, '$1-$2-$3')
    .replace(/(\d)\s*年\s*(\d)/g, '$1-$2')
    .replace(/(\d)\s*月\s*(\d)/g, '$1-$2')
    .replace(/(\d)\s*日/g, '$1')
    .replace(/(\d{4})-(\d{1,2})-(\d{1,2})/g, (_, y: string, m: string, d: string) =>
      `${y}-${Number(m)}-${Number(d)}`,
    )
    .replace(
      /(\d)\s*(%|元|块|万|亿|千|百|天|周|月|年|小时|分钟|秒|岁|人|次|个|条|页|字|kg|g|km|cm|mm|ml|l|m)(?![a-z])/gi,
      '$1$2',
    )
    .replace(/[，,]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

const TOKEN_PATTERNS: RegExp[] = [
  /\d{4}-\d{1,2}-\d{1,2}/g,
  /(?<!\d)\d{1,2}-\d{1,2}(?!\d)/g,
  /\d{1,2}:\d{2}/g,
  /\d+(?:\.\d+)?(?:%|元|块|万|亿|千|百|天|周|月|年|小时|分钟|秒|岁|人|次|个|条|页|字|kg|g|km|cm|mm|ml|l|m)/gi,
  /(?<![\d.])\d{2,}(?:\.\d+)?(?![\d.])/g,
];

/** 抽取需要保真的数字/日期 token（去重、保持出现顺序） */
export function extractNumericTokens(text: string): string[] {
  const normalized = normalizeForFidelity(text);
  const found = new Set<string>();
  for (const pattern of TOKEN_PATTERNS) {
    for (const match of normalized.matchAll(pattern)) {
      const token = match[0];
      if (token.length >= 2) found.add(token);
    }
  }
  return [...found];
}

export interface FidelityResult {
  passed: boolean;
  /** 原文出现但摘要结果中缺失的数字/日期 */
  missing: string[];
}

/** 把结构化摘要渲染为可比对文本 */
function payloadText(payload: SummaryPayload): string {
  const facts = payload.facts.map((fact) =>
    [fact.key, fact.value, fact.unit ?? '', fact.validFrom ?? ''].join(' '),
  );
  return [payload.summary, ...facts, ...payload.decisions, ...payload.openLoops].join('\n');
}

/** 核对原文数字/日期在摘要结果中的保留情况 */
export function checkSummaryFidelity(
  payload: SummaryPayload,
  sourceText: string,
): FidelityResult {
  const tokens = extractNumericTokens(sourceText);
  if (tokens.length === 0) return { passed: true, missing: [] };
  const rendered = normalizeForFidelity(payloadText(payload));
  const missing = tokens.filter((token) => !rendered.includes(token));
  return { passed: missing.length === 0, missing };
}

/**
 * 取包含缺失 token 的原文片段（最多 3 行 / 200 字符）。
 * 用于重试仍丢失时的兜底保留，宁可占一点预算也不丢关键数字。
 */
export function collectSourceSnippets(
  sourceText: string,
  missing: readonly string[],
  maxChars = 200,
): string {
  if (missing.length === 0) return '';
  const picked: string[] = [];
  for (const line of sourceText.split('\n')) {
    const normalized = normalizeForFidelity(line);
    if (!missing.some((token) => normalized.includes(token))) continue;
    const trimmed = line.trim();
    if (!trimmed || picked.includes(trimmed)) continue;
    picked.push(trimmed);
    if (picked.length >= 3) break;
  }
  const joined = picked.join('；');
  return joined.length > maxChars ? `${joined.slice(0, maxChars)}…` : joined;
}

/** 把原文片段追加到摘要末尾（已有摘要上限保护） */
export function appendSnippets(summary: string, snippets: string): string {
  if (!snippets) return summary;
  const block = `【原文片段】${snippets}`;
  return summary.includes('【原文片段】') ? summary : `${summary}\n${block}`.trim();
}
