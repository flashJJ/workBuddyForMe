/**
 * 编译优先静态知识检索（v1.3 M2/T2.5）。
 *
 * 纯本地、零模型调用：查询 → analyzeQuery 抽词 → 仓储粗召回
 * （normalized 精确 + 名称/别名 LIKE 候选 + 摘要词项候选）→
 * selectStaticKnowledge 精确复核并截断到 ≤2 实体 + 1 摘要。
 * 未编译知识库自然得到空数组，调用方零差异回落 chunk 融合链路。
 */

import {
  createCompileQueryRepository,
  type EntityRecord,
} from '@wbfm/database';
import type { ServiceDeps } from '../services/deps';
import { normalizeEntityName } from './entity-extractor';
import {
  analyzeQuery,
  selectStaticKnowledge,
  type SelectorEntity,
  type SelectorSummary,
  type StaticFact,
} from './static-selector';

function toSelectorEntity(entity: EntityRecord): SelectorEntity {
  return {
    name: entity.name,
    normalizedName: entity.normalizedName,
    aliases: entity.aliases,
    kind: entity.kind,
    mentionCount: entity.mentionCount,
    mentions: entity.mentions.map((m) => ({
      context: m.context,
      documentId: m.documentId,
      documentName: m.documentName,
      chunkId: m.chunkId,
      pageNo: m.pageNo,
      paragraphNo: m.paragraphNo,
    })),
  };
}

export function createStaticKnowledgeService(deps: ServiceDeps) {
  return {
    /**
     * @returns 高置信静态事实（已截断上限）；未就绪/未命中为 []
     */
    retrieve(
      knowledgeBaseId: string,
      query: string,
      options?: { maxEntities?: number; maxSummaries?: number },
    ): StaticFact[] {
      const trimmed = query.trim();
      if (trimmed.length < 2) return [];
      const signals = analyzeQuery(trimmed);

      const repo = createCompileQueryRepository(deps.db);
      const normalizedNames = [
        ...new Set(
          [...signals.terms, signals.normalizedQuery]
            .map(normalizeEntityName)
            .filter((n) => n.length >= 2),
        ),
      ];

      const exact = repo.findEntitiesByNames(knowledgeBaseId, normalizedNames);
      const fuzzy = repo.searchEntityCandidates(knowledgeBaseId, signals.terms);
      const entities = new Map<string, EntityRecord>();
      for (const record of [...exact, ...fuzzy]) entities.set(record.id, record);

      const summaries: SelectorSummary[] = repo
        .searchSummaries(knowledgeBaseId, signals.terms)
        .map((s) => ({
          documentId: s.documentId,
          documentName: s.documentName,
          tldr: s.tldr,
          bullets: s.bullets,
          keyTerms: s.keyTerms,
        }));

      return selectStaticKnowledge(
        signals,
        [...entities.values()].map(toSelectorEntity),
        summaries,
        options,
      );
    },
  };
}

export type StaticKnowledgeService = ReturnType<typeof createStaticKnowledgeService>;
