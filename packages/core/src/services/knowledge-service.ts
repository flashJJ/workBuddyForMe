import { ApiError, type KnowledgeBase } from '@wbfm/shared';
import type {
  KnowledgeBaseCreateFields,
  KnowledgeBaseUpdateFields,
} from '@wbfm/database';
import {
  createDocumentRepository,
  createKnowledgeRepository,
  deleteVectorsByDocument,
} from '@wbfm/database';
import type { ServiceDeps } from './deps';

export function createKnowledgeService({ db }: ServiceDeps) {
  const knowledgeBases = createKnowledgeRepository(db);
  const documents = createDocumentRepository(db);

  const requireKnowledgeBase = (id: string): KnowledgeBase => {
    const knowledgeBase = knowledgeBases.findById(id);
    if (!knowledgeBase) throw ApiError.notFound('知识库', id);
    return knowledgeBase;
  };

  return {
    list(): KnowledgeBase[] {
      return knowledgeBases.list();
    },

    get(id: string): KnowledgeBase {
      return requireKnowledgeBase(id);
    },

    create(fields: KnowledgeBaseCreateFields): KnowledgeBase {
      return knowledgeBases.create(fields);
    },

    update(id: string, fields: KnowledgeBaseUpdateFields): KnowledgeBase {
      requireKnowledgeBase(id);
      const updated = knowledgeBases.update(id, fields);
      if (!updated) throw ApiError.notFound('知识库', id);
      return updated;
    },

    /** 删除知识库：先清向量（vec0 不随外键级联），文档/分片由 FK 级联删除 */
    delete(id: string): void {
      requireKnowledgeBase(id);
      const cleanup = db.transaction(() => {
        for (const document of documents.listByKnowledgeBase(id)) {
          deleteVectorsByDocument(db, document.id);
        }
        knowledgeBases.delete(id);
      });
      cleanup();
    },
  };
}

export type KnowledgeService = ReturnType<typeof createKnowledgeService>;
