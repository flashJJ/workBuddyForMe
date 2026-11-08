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
  createRelationRepository,
  createSettingsRepository,
  type EntityRecord,
} from '@wbfm/database';
import type { ServiceDeps } from '../services/base/deps';
import { normalizeEntityName } from './entity-extractor';
import { clampRelationCaps, collectMultiHopRelations } from './relations';
import {
  analyzeQuery,
  isEntityMentioned,
  selectStaticKnowledge,
  type SelectorEntity,
  type SelectorRelation,
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

      const records = [...entities.values()];
      const selectorEntities = records.map(toSelectorEntity);
      const mentionedIds = records
        .filter((_record, index) => isEntityMentioned(selectorEntities[index]!, signals))
        .map((record) => record.id);

      const mentionedSet = new Set(mentionedIds);
      const relationRepo = createRelationRepository(deps.db);
      const settings = createSettingsRepository(deps.db).getJson('app-settings', null) as {
        knowledgeRelationMaxHops?: number;
        knowledgeRelationMaxEdges?: number;
      } | null;
      const caps = clampRelationCaps({
        maxHops: settings?.knowledgeRelationMaxHops,
        maxEdges: settings?.knowledgeRelationMaxEdges,
      });
      const relationRows =
        mentionedIds.length > 0
          ? collectMultiHopRelations(
              mentionedIds,
              (ids) => relationRepo.listForEntities(knowledgeBaseId, ids),
              caps,
            )
          : [];
      relationRows.sort((a, b) => {
        const direct = (row: (typeof relationRows)[number]) =>
          mentionedSet.has(row.fromEntityId) && mentionedSet.has(row.toEntityId) ? 1 : 0;
        return direct(b) - direct(a) || a.hop - b.hop || b.confidence - a.confidence;
      });
      const relations: SelectorRelation[] = relationRows
        .filter((row) => row.sourceDocumentId && row.sourceDocumentName)
        .map((row) => ({
          id: row.id,
          fromEntityName: row.fromEntityName,
          toEntityName: row.toEntityName,
          relation: row.relation,
          description: row.description,
          documentId: row.sourceDocumentId!,
          documentName: row.sourceDocumentName!,
          chunkId: row.sourceChunkId,
          pageNo: row.pageNo,
          paragraphNo: row.paragraphNo,
          confidence: row.confidence,
        }));

      return selectStaticKnowledge(
        signals,
        selectorEntities,
        summaries,
        { ...options, relations },
      );
    },
  };
}

export type StaticKnowledgeService = ReturnType<typeof createStaticKnowledgeService>;
