/**
 * 编译优先路由选择器（v1.3 M2/T2.5，纯函数）。
 *
 * 查询经仓储粗召回（实体 normalized 精确 + LIKE 候选、摘要词项候选）后，
 * 本模块做两件事：① 对候选做精确复核（查询必须逐字包含实体名/别名，
 * LIKE 只负责召回，防止跨 JSON 边界的假命中注入上下文）；② 按硬上限
 * 选出「≤2 实体事实 + 1 摘要事实」，所有文本都是可回指原句。
 */

import { normalizeEntityName } from './entity-extractor';
import { extractKeyTerms } from './rule-extractor';

export type StaticFactKind = 'entity' | 'summary';

export interface SelectorMention {
  context: string;
  documentId: string;
  documentName: string;
  chunkId: number | null;
  pageNo: number | null;
  paragraphNo: number | null;
}

export interface SelectorEntity {
  name: string;
  normalizedName: string;
  aliases: string[];
  kind: string;
  mentionCount: number;
  mentions: SelectorMention[];
}

export interface SelectorSummary {
  documentId: string;
  documentName: string;
  tldr: string;
  bullets: string[];
  keyTerms: string[];
}

export interface StaticFact {
  kind: StaticFactKind;
  /** 注入文本（实体=最高价值 mention 原句；摘要=tldr+首要点，均为原文） */
  text: string;
  documentId: string;
  documentName: string;
  chunkId: number | null;
  pageNo: number | null;
  paragraphNo: number | null;
  /** kind=entity 时的实体规范名 */
  entityName?: string;
}

export interface StaticSelectorOptions {
  maxEntities?: number;
  maxSummaries?: number;
}

/** 名称最小长度：中文 2 字、拉丁 3 字符，避免单字误命中（如「的」「A」） */
function nameMinLength(name: string): number {
  return /[一-鿿]/.test(name) ? 2 : 3;
}

export interface QuerySignals {
  /** 归一化后的整句（用于子串包含判定） */
  normalizedQuery: string;
  /** 查询关键词（原样 + 归一化） */
  terms: string[];
  normalizedTerms: string[];
  /** 查询中文连续串的邻接二字集合（mention 选句的语义重合信号） */
  cjkBigrams: string[];
}

export function analyzeQuery(query: string): QuerySignals {
  const terms = extractKeyTerms(query, 10);
  // 抽取器词表偏文档统计，查询侧再补：按标点/空白切出的 2+ 字片段。
  // 注意不切英文 '.' 与 ':'——型号/版本号（qwen2.5、USB-C:2）不能被打断。
  for (const raw of query.split(/[\s，。！？、；：,!?;（）()「」『』""'']+/)) {
    const piece = raw.trim();
    if (piece.length >= 2 && !terms.includes(piece)) terms.push(piece);
  }
  const bigrams: string[] = [];
  for (const run of query.match(/[一-鿿]{2,}/g) ?? []) {
    for (let i = 0; i < run.length - 1; i += 1) {
      const bi = run.slice(i, i + 2);
      if (!bigrams.includes(bi)) bigrams.push(bi);
    }
  }
  return {
    normalizedQuery: normalizeEntityName(query),
    terms,
    normalizedTerms: terms.map(normalizeEntityName).filter(Boolean),
    cjkBigrams: bigrams,
  };
}

/** 实体是否被查询精确提及：查询原文包含名称/别名，或归一化后包含归一键 */
export function isEntityMentioned(entity: SelectorEntity, signals: QuerySignals): boolean {
  const surfaces = [entity.name, ...entity.aliases];
  for (const surface of surfaces) {
    if (surface.length < nameMinLength(surface)) continue;
    if (signals.terms.some((t) => t.includes(surface) || surface.includes(t))) return true;
  }
  // 归一键路径同样执行最小长度门槛（按键内是否含汉字区分）
  if (entity.normalizedName.length >= nameMinLength(entity.normalizedName)) {
    if (signals.normalizedTerms.some((t) => t.includes(entity.normalizedName))) return true;
    if (signals.normalizedQuery.includes(entity.normalizedName)) return true;
  }
  return false;
}

/** 摘要相关性复核：tldr/key_terms 必须真的被查询词项命中（仓储只做粗排） */
export function isSummaryRelevant(summary: SelectorSummary, signals: QuerySignals): boolean {
  return signals.terms.some((term) => {
    if (term.length < 2) return false;
    if (summary.tldr.includes(term)) return true;
    return summary.keyTerms.some((k) => k.includes(term) || term.includes(k));
  });
}

/**
 * 选最高价值 mention：① 必须包含实体名/别名（基础分）；② 与查询中文 bigram
 * 重合越多越贴题；③ 同分取更短（信息密度高）。
 */
function bestMention(entity: SelectorEntity, signals: QuerySignals): SelectorMention | null {
  const surfaces = [entity.name, ...entity.aliases];
  const scored = entity.mentions
    .map((m) => {
      const named = surfaces.some((s) => m.context.includes(s)) ? 2 : 0;
      const queryHits = signals.cjkBigrams.filter((bi) => m.context.includes(bi)).length;
      return { m, score: named + Math.min(queryHits, 5) - Math.min(m.context.length / 200, 1) };
    })
    .sort((a, b) => b.score - a.score || a.m.context.length - b.m.context.length);
  return scored[0]?.m ?? entity.mentions[0] ?? null;
}

function entityScore(entity: SelectorEntity, signals: QuerySignals): number {
  // 命中面越长越精确（全名优于别名缩写），mention 多者作平局加权
  const surfaces = [entity.name, ...entity.aliases].filter((s) =>
    signals.terms.some((t) => t.includes(s) || s.includes(t)),
  );
  const surfaceBonus = Math.max(0, ...surfaces.map((s) => s.length));
  return surfaceBonus * 10 + Math.min(entity.mentionCount, 10);
}

/**
 * 纯选择：复核候选 → ≤N 实体事实（同文档不重复占额）→ ≤N 摘要事实。
 * 实体与摘要可来自同文档（静态上限只约束条数，不做文档去重）。
 */
export function selectStaticKnowledge(
  signals: QuerySignals,
  entities: SelectorEntity[] = [],
  summaries: SelectorSummary[] = [],
  options: StaticSelectorOptions = {},
): StaticFact[] {
  const maxEntities = options.maxEntities ?? 2;
  const maxSummaries = options.maxSummaries ?? 1;
  const facts: StaticFact[] = [];

  const mentioned = entities
    .filter((e) => isEntityMentioned(e, signals))
    .sort((a, b) => entityScore(b, signals) - entityScore(a, signals));

  const seenEntityKeys = new Set<string>();
  for (const entity of mentioned) {
    if (facts.length >= maxEntities) break;
    const mention = bestMention(entity, signals);
    if (!mention) continue;
    const dedupeKey = `${mention.documentId}:${mention.context}`;
    if (seenEntityKeys.has(dedupeKey)) continue;
    seenEntityKeys.add(dedupeKey);
    facts.push({
      kind: 'entity',
      text: mention.context,
      documentId: mention.documentId,
      documentName: mention.documentName,
      chunkId: mention.chunkId,
      pageNo: mention.pageNo,
      paragraphNo: mention.paragraphNo,
      entityName: entity.name,
    });
  }

  for (const summary of summaries.filter((s) => isSummaryRelevant(s, signals)).slice(0, maxSummaries)) {
    const parts = [summary.tldr, ...summary.bullets.slice(0, 1)].filter(Boolean);
    const text = parts.join('\n');
    if (!text.trim()) continue;
    facts.push({
      kind: 'summary',
      text,
      documentId: summary.documentId,
      documentName: summary.documentName,
      chunkId: null,
      pageNo: null,
      paragraphNo: null,
    });
  }

  return facts;
}
