/**
 * 规则重排纯函数（v1.3 M1，默认零模型零成本）。
 *
 * RRF 只看「在各路的排名」，无法利用查询与文本的字面关系；规则重排在融合分
 * 基础上叠加可解释的字面/覆盖信号，提升精确词与专有名词问题的排序：
 *  - 双通道同时命中（向量与关键词都认可）
 *  - 查询词在 chunk 正文/文档名中的覆盖率
 *  - 查询多字短语在正文中连续出现
 *  - 文档名命中查询词
 * 权重全部常量化并由单测锁定；无新鲜度加权（私有知识无时效信号）。
 */

import { tokenizeForFts } from '@wbfm/database';
import type { FusedHit } from './hybrid-fusion';

export interface RerankCandidate {
  chunkId: number;
  content: string;
  documentName: string;
  channels: FusedHit['channels'];
  /** 该 chunk 的 RRF 融合分（作为基础分，归一化到 [0,1] 后参与） */
  rrf: number;
}

export interface RuleRerankWeights {
  /** 双通道同时命中 */
  bothChannels: number;
  /** 查询词覆盖率（命中词数 / 查询词数），按比例计入 */
  coverage: number;
  /** 查询多字短语在正文连续出现（一次性奖励） */
  consecutivePhrase: number;
  /** 文档名命中任一查询词 */
  docNameHit: number;
}

export const DEFAULT_RERANK_WEIGHTS: RuleRerankWeights = {
  bothChannels: 0.15,
  coverage: 0.4,
  consecutivePhrase: 0.2,
  docNameHit: 0.1,
};

export interface ScoredCandidate {
  chunkId: number;
  score: number;
  /** 命中的查询词（可观测/调试用） */
  matchedTerms: string[];
}

/**
 * 对融合后的候选统一打分排序。candidates 可为任意顺序；结果按 score 降序，
 * 同分按 chunkId 升序保证确定性。query 无可检索词时退化为按 rrf 排序。
 */
export function ruleRerank(
  candidates: readonly RerankCandidate[],
  query: string,
  weights: RuleRerankWeights = DEFAULT_RERANK_WEIGHTS,
): ScoredCandidate[] {
  const terms = [...new Set(tokenizeForFts(query))];
  const maxRrf = candidates.reduce((m, c) => Math.max(m, c.rrf), 0) || 1;

  const scored = candidates.map((candidate) => {
    const contentLower = candidate.content.toLowerCase();
    const nameLower = candidate.documentName.toLowerCase();
    const matched = terms.filter((term) => contentLower.includes(term));

    const both = candidate.channels.length >= 2 ? weights.bothChannels : 0;
    const coverageRate = terms.length > 0 ? matched.length / terms.length : 0;
    const coverage = weights.coverage * coverageRate;

    // 连续短语：原始查询（去首尾空白）长度 ≥2 且在正文连续出现
    const phrase = query.trim();
    const phraseHit =
      phrase.length >= 2 && candidate.content.includes(phrase)
        ? weights.consecutivePhrase
        : 0;

    const docHit = terms.some((term) => nameLower.includes(term))
      ? weights.docNameHit
      : 0;

    // 基础分：归一化 RRF（保证关闭字面信号时仍严格按融合排名）
    const base = candidate.rrf / maxRrf;
    // 字面信号总增益有上界（三项相加 ≤0.7），避免完全盖过语义基础分
    return {
      chunkId: candidate.chunkId,
      score: base + both + coverage + phraseHit + docHit,
      matchedTerms: matched,
    };
  });

  return scored.sort((a, b) =>
    b.score !== a.score ? b.score - a.score : a.chunkId - b.chunkId,
  );
}
