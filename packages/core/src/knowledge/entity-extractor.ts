/**
 * 无模型实体抽取（v1.3 M2，纯函数、确定性、零网络调用）。
 *
 * 只从原文「挑短语/原句」，绝不生成文本：实体名与 mention 均可回指原文。
 * 与 rule-extractor（摘要/关键词）并列；MODEL_PATTERN 同时供两者复用，
 * 故与实体相关的型号信号一并放在本文件。
 */

import { splitSentences, type TextSpan } from './text-units';

/** 型号/编号模式：字母数字连写（可含 -_. 与冒号数字），如 qwen2.5、BGE-M3、USB-C */
export const MODEL_PATTERN = /\b[A-Za-z][A-Za-z0-9]*[-_.]?[A-Za-z0-9]+(?:[:.][A-Za-z0-9]+)?\b/g;

export type EntityKind = 'concept' | 'person' | 'org' | 'product' | 'number' | 'other';

export interface EntityMentionSpec {
  /** 出现处原句（可回指） */
  context: string;
  /** 该句在所属文本中的字符偏移（局部坐标，由编译器加 chunk 基偏移） */
  charStart: number;
  charEnd: number;
}

export interface EntitySpec {
  name: string;
  normalizedName: string;
  kind: EntityKind;
  aliases: string[];
  mentions: EntityMentionSpec[];
}

/** 名称归一化：NFKC 折叠、去空白与常见标点、全半角、小写（中文不变） */
export function normalizeEntityName(name: string): string {
  return name
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[\s\u3000·・,，.。:：;；/\\|[\]()（）【】{}'""'']+/g, '')
    .trim();
}

const PERSON_TITLE = /(先生|女士|博士|教授|经理|老师)$/;

/** 粗分类：型号→product；数字带单位→number；人名头衔→person；默认 concept */
function classify(name: string, context: string): EntityKind {
  if (/[A-Za-z0-9]/.test(name) && /[-_0-9]/.test(name)) return 'product';
  if (PERSON_TITLE.test(context) && name.length <= 4 && !/[A-Za-z]/.test(name)) return 'person';
  if (/^\d+(\.\d+)?(%|万|亿|GB|MB|TB|ms|秒|分|元|米|个|条|页|版)$/.test(name)) return 'number';
  if (/公司|集团|团队|组织|实验室|Inc|Ltd|Corp/i.test(name)) return 'org';
  return 'concept';
}

/** 括号别名模式：中文名（English Name）或 English Name（中文名） */
const PAREN_ALIAS = /([\u4e00-\u9fa5A-Za-z0-9][\u4e00-\u9fa5A-Za-z0-9 ._-]{1,40})\s*[（(]([^（）()]{1,40})[）)]/g;

interface NameCandidate {
  name: string;
  index: number;
  /** 括号对命中时携带对侧别名 */
  aliases: string[];
}

/**
 * 候选专名：括号对两侧名称（互记别名）优先登记，并把两侧区间标为遮蔽区——
 * 区内的型号/引号碎片（如 "Hybrid Retrieval" 被拆出的 Hybrid/Retrieval）
 * 不再单独成实体，避免别名污染；其余取引号短语、型号整词。
 */
function candidateNames(text: string): NameCandidate[] {
  const out: NameCandidate[] = [];
  const sideSpans: Array<{ start: number; end: number }> = [];

  for (const m of text.matchAll(PAREN_ALIAS)) {
    const left = m[1]!;
    const right = m[2]!;
    const leftStart = m.index ?? 0;
    const gap = m[0].slice(left.length).match(/^\s*/)?.[0]?.length ?? 0;
    const rightStart = leftStart + left.length + gap + 1; // +1 为左括号
    sideSpans.push({ start: leftStart, end: leftStart + left.length });
    sideSpans.push({ start: rightStart, end: rightStart + right.length });
    out.push({ name: left, index: leftStart, aliases: [right] });
    out.push({ name: right, index: rightStart, aliases: [left] });
  }

  const insidePairSide = (index: number, len: number): boolean =>
    sideSpans.some((span) => index >= span.start && index + len <= span.end);

  for (const m of text.matchAll(/[「『"']([^」』"']{2,30})[」』"']/g)) {
    const name = m[1]!;
    if (!insidePairSide(m.index ?? 0, name.length)) {
      out.push({ name, index: m.index ?? 0, aliases: [] });
    }
  }
  for (const m of text.matchAll(MODEL_PATTERN)) {
    const name = m[0]!;
    if (!insidePairSide(m.index ?? 0, name.length)) {
      out.push({ name, index: m.index ?? 0, aliases: [] });
    }
  }
  return out;
}

/**
 * 规则实体抽取（单文档内）：
 * - 候选来自引号/型号/括号别名；同 normalized_name 归并并累加 mention；
 * - 括号两侧名称互为别名；
 * - 每个实体的 mention 收集其出现原句（去重，上限 5 条防膨胀）。
 */
export function extractRuleEntities(text: string, maxEntities = 20): EntitySpec[] {
  const byNormalized = new Map<string, EntitySpec>();
  const sentences = splitSentences(text);

  const sentenceOf = (index: number): TextSpan | undefined =>
    sentences.find((s) => index >= s.start && index < s.end);

  const upsert = (
    name: string,
    aliases: string[],
    mention: EntityMentionSpec,
  ): EntitySpec => {
    const normalizedName = normalizeEntityName(name);
    let entity = byNormalized.get(normalizedName);
    if (!entity) {
      entity = {
        name,
        normalizedName,
        kind: classify(name, mention.context),
        aliases: [],
        mentions: [],
      };
      byNormalized.set(normalizedName, entity);
    }
    for (const alias of aliases) {
      if (alias !== name && alias !== entity.name && !entity.aliases.includes(alias)) {
        entity.aliases.push(alias);
      }
    }
    if (entity.mentions.length < 5 && !entity.mentions.some((m) => m.context === mention.context)) {
      entity.mentions.push(mention);
    }
    return entity;
  };

  for (const candidate of candidateNames(text)) {
    const { name, index } = candidate;
    if (name.length < 2) continue;
    const sentence = sentenceOf(index);
    const mention: EntityMentionSpec = sentence
      ? { context: sentence.text, charStart: sentence.start, charEnd: sentence.end }
      : { context: name, charStart: index, charEnd: index + name.length };

    upsert(name, candidate.aliases, mention);
  }

  return [...byNormalized.values()]
    .sort((a, b) => b.mentions.length - a.mentions.length || a.name.localeCompare(b.name, 'zh'))
    .slice(0, maxEntities);
}
