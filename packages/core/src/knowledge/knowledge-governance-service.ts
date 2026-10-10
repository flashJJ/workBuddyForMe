/**
 * 知识治理只读服务（v1.3 M3）：冲突待裁决 + 疑似重复文档建议。
 *
 * 全部基于编译产物与既有向量，零新增模型调用；两类结果都只是「建议」，
 * 不执行任何删除/合并动作（Non-Goal：不自动改用户资料）。
 */

import {
  createCompileQueryRepository,
  createDocumentRepository,
  createKnowledgeRepository,
  listChunkVectorsByKb,
  recallVectorCandidates,
} from '@wbfm/database';
import type { ServiceDeps } from '../services/deps';
import { detectConflicts, type ConflictItem } from './conflict-detector';
import {
  detectDuplicatePairs,
  type DuplicatePair,
} from './duplicate-detector';

/** 疑似重复内容阈值：单位向量相似度 ≥0.92（L2 距离 ≤0.16） */
const DUPLICATE_MIN_SIMILARITY = 0.92;
/** 每个源分片参与跨文档 KNN 的近邻数 */
const DUPLICATE_KNN_K = 5;
/** 全库扫描的分片总量上限（每文档再限 5 片），桌面规模足够 */
const DUPLICATE_SCAN_CAP = 200;

export function createKnowledgeGovernanceService(deps: ServiceDeps) {
  return {
    /** 列出知识库内跨文档取值冲突（无编译产物时为空数组，不抛错） */
    listConflicts(knowledgeBaseId: string): ConflictItem[] {
      const entities = createCompileQueryRepository(deps.db).listEntities(knowledgeBaseId);
      return detectConflicts(
        entities.map((entity) => ({
          name: entity.name,
          normalizedName: entity.normalizedName,
          kind: entity.kind,
          aliases: entity.aliases,
          mentions: entity.mentions.map((m) => ({
            context: m.context,
            documentId: m.documentId,
            documentName: m.documentName,
            pageNo: m.pageNo,
            paragraphNo: m.paragraphNo,
          })),
        })),
      );
    },

    /**
     * 疑似重复文档：文件名归一化分组 + 跨文档高相似分片对聚合。
     * 未建向量表（未嵌入）时仅返回标题信号。
     */
    listDuplicateSuggestions(
      knowledgeBaseId: string,
      options: { minChunkPairs?: number } = {},
    ): DuplicatePair[] {
      const kbRepo = createKnowledgeRepository(deps.db);
      if (!kbRepo.findById(knowledgeBaseId)) return [];
      const docs = createDocumentRepository(deps.db)
        .listByKnowledgeBase(knowledgeBaseId)
        .map((d) => ({ documentId: d.id, filename: d.filename }));
      if (docs.length < 2) return [];

      const rows = listChunkVectorsByKb(deps.db, knowledgeBaseId).slice(0, DUPLICATE_SCAN_CAP);
      // id→文档映射覆盖全库：KNN 近邻可能来自他文档的未采样分片
      const chunkIdToDoc = new Map<number, string>(
        (
          deps.db
            .prepare(
              `SELECT c.id AS id, c.document_id AS doc FROM document_chunks c
               JOIN documents d ON d.id = c.document_id WHERE d.knowledge_base_id = ?`,
            )
            .all(knowledgeBaseId) as Array<{ id: number; doc: string }>
        ).map((r) => [r.id, r.doc]),
      );

      const neighborHits = [];
      for (const row of rows) {
        const neighbors = recallVectorCandidates(deps.db, {
          knowledgeBaseId,
          vector: row.embedding,
          candidateN: DUPLICATE_KNN_K,
          minSimilarity: DUPLICATE_MIN_SIMILARITY,
        });
        for (const hit of neighbors) {
          if (hit.chunkId === row.chunkId) continue;
          const neighborDoc = chunkIdToDoc.get(hit.chunkId);
          if (!neighborDoc || neighborDoc === row.documentId) continue;
          neighborHits.push({
            sourceChunkId: row.chunkId,
            sourceDocumentId: row.documentId,
            neighborChunkId: hit.chunkId,
            neighborDocumentId: neighborDoc,
            similarity: hit.similarity,
          });
        }
      }

      return detectDuplicatePairs(docs, neighborHits, {
        minChunkPairs: options.minChunkPairs,
      });
    },
  };
}

export type KnowledgeGovernanceService = ReturnType<typeof createKnowledgeGovernanceService>;
