import { MEMORY_CONSTRAINT_MIN_IMPORTANCE } from '@wbfm/shared/constants';
import type { ExtractedMemory } from '../extractor';

/**
 * v2.26 实时硬约束抽取（纯规则，零 LLM）：
 * 只覆盖窄而明确的句式——过敏、忌口、带时间前缀的禁止、显式「记住」。
 * 命中即写 constraint + pinned，importance 取高值；宁可漏判，不做宽泛猜测。
 */

const ALLERGY_PATTERNS = [
  /我对([^，。！？；、\s]{1,12})过敏/g,
  /我(?!对)([^，。！？；、\s对]{1,12})过敏/g,
];
const DIET_PATTERN = /(?:我不能吃|我不吃|忌口(?:了)?)([^，。！？；、\s]{1,20})/g;
/** 过敏主语里的程度/频率副词（「我最近有点过敏」不是具体过敏原） */
const ADVERB_PREFIX = /^(有点|很|非常|最近|一直|也|都|还|又|会|已)/;
const PROHIBITION_PATTERN =
  /(?:以后|今后|之后)\s*(不要|别|禁止)\s*([^，。！？；、\s]{1,30})/g;
const REMEMBER_PATTERN = /记住[：:]?\s*([^。！？\n]{2,100})/g;

export function extractRealtimeConstraints(userContent: string): ExtractedMemory[] {
  if (!userContent.trim()) return [];
  const found = new Map<string, ExtractedMemory>();

  const push = (subjectKey: string, content: string): void => {
    if (found.has(subjectKey)) return;
    found.set(subjectKey, {
      kind: 'constraint',
      content: content.slice(0, 500),
      importance: MEMORY_CONSTRAINT_MIN_IMPORTANCE,
      pinned: true,
      confidence: 1,
      subjectKey,
    });
  };

  for (const pattern of ALLERGY_PATTERNS) {
    for (const match of userContent.matchAll(pattern)) {
      const subject = normalizeSubject(match[1] ?? '');
      if (!subject || ADVERB_PREFIX.test(subject)) continue;
      push(`allergy:${subject}`, `用户对${subject}过敏`);
    }
  }
  for (const match of userContent.matchAll(DIET_PATTERN)) {
    const subject = normalizeSubject(match[1] ?? '');
    if (!subject) continue;
    push(`diet:avoid:${subject}`, `用户忌口：${subject}`);
  }
  for (const match of userContent.matchAll(PROHIBITION_PATTERN)) {
    const verb = match[1] ?? '不要';
    const subject = normalizeSubject(match[2] ?? '');
    if (!subject) continue;
    push(`prohibition:${hashKey(subject)}`, `用户明确要求：以后${verb}${subject}`);
  }
  for (const match of userContent.matchAll(REMEMBER_PATTERN)) {
    const content = (match[1] ?? '').trim();
    if (content.length < 2) continue;
    push(`explicit:${hashKey(content)}`, `用户要求记住：${content}`);
  }

  return [...found.values()];
}

/** 主体归一化：去空白/首尾虚词，拉丁转小写；空串返回 null */
function normalizeSubject(raw: string): string | null {
  const text = raw
    .trim()
    .replace(/^[对的了、\s]+/, '')
    .replace(/[\s]+/g, '')
    .toLowerCase();
  return text.length > 0 ? text : null;
}

/** FNV-1a 稳定短哈希，用于无自然主体键的约束去重 */
function hashKey(input: string): string {
  let hash = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}
