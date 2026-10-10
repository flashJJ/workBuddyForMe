import type { Assistant } from '@wbfm/shared/types';
import { createSettingsRepository } from '@wbfm/database';
import type { RagContext, RagChunk, RagRetriever } from '../chat/types';
import { createStaticKnowledgeService } from '../knowledge/static-knowledge-service';
import type { ServiceDeps } from '../services/deps';
import { formatContextBlock, toCitations } from './context-formatter';
import {
  createRetrievalService,
  DEFAULT_MAX_CHUNKS,
  DEFAULT_MIN_VEC_SIMILARITY,
  type RetrievalOptions,
  type RetrievedChunk,
} from './retrieval-service';

const SETTINGS_KEY = 'app-settings';

/** 从 app-settings 读取知识检索选项（缺省值与检索层默认一致：混合开启） */
function readRetrievalOptions(deps: ServiceDeps): RetrievalOptions & {
  compileRoutingEnabled: boolean;
} {
  const raw = createSettingsRepository(deps.db).getJson(SETTINGS_KEY, null) as
    | {
        hybridRetrievalEnabled?: boolean;
        retrievalMinSimilarity?: number;
        retrievalMaxChunks?: number;
        compileRoutingEnabled?: boolean;
      }
    | null;
  return {
    hybridEnabled: raw?.hybridRetrievalEnabled !== false,
    minVecSimilarity:
      typeof raw?.retrievalMinSimilarity === 'number'
        ? raw.retrievalMinSimilarity
        : DEFAULT_MIN_VEC_SIMILARITY,
    maxChunks:
      typeof raw?.retrievalMaxChunks === 'number'
        ? raw.retrievalMaxChunks
        : DEFAULT_MAX_CHUNKS,
    // 编译优先路由默认开启；编译层为空时自然零差异（M5 反向验证开关）
    compileRoutingEnabled: raw?.compileRoutingEnabled !== false,
  };
}

/** 静态事实装配为资料块条目（置顶，少量高置信） */
function factToRagChunk(
  fact: Awaited<ReturnType<ReturnType<typeof createStaticKnowledgeService>['retrieve']>>[number],
): RagChunk {
  return {
    documentName: fact.documentName,
    ordinal: 0,
    content: fact.text,
    staticKind: fact.kind,
    documentId: fact.documentId,
    sourceUrl: null,
    pageNo: fact.pageNo,
    paragraphNo: fact.paragraphNo,
  };
}

function chunkToRagChunk(chunk: RetrievedChunk): RagChunk {
  return {
    documentName: chunk.documentName,
    ordinal: chunk.ordinal,
    content: chunk.content,
    documentId: chunk.documentId,
    sourceUrl: chunk.sourceUrl,
    pageNo: chunk.pageNo ?? null,
    paragraphNo: chunk.paragraphNo ?? null,
  };
}

/**
 * 构造对话编排使用的 RAG 钩子：
 * 静态编译事实（≤2 实体+1 摘要）置顶 + 混合检索分片；两者皆空 /
 * 未配置 embedding 且无静态命中时返回 null（退化为普通对话）。
 */
export function createRagRetriever(deps: ServiceDeps): RagRetriever {
  const retrieval = createRetrievalService(deps);
  const staticKnowledge = createStaticKnowledgeService(deps);

  return async (
    question: string,
    assistant: Assistant,
    signal?: AbortSignal,
  ): Promise<RagContext | null> => {
    if (!assistant.knowledgeBaseId) return null;
    const options = readRetrievalOptions(deps);
    const { compileRoutingEnabled, ...retrievalOptions } = options;

    const facts = compileRoutingEnabled
      ? staticKnowledge.retrieve(assistant.knowledgeBaseId, question)
      : [];
    const chunks = await retrieval.retrieve(
      {
        knowledgeBaseId: assistant.knowledgeBaseId,
        query: question,
        signal,
      },
      retrievalOptions,
    );
    if (facts.length === 0 && chunks.length === 0) return null;

    const entries: RagChunk[] = [
      ...facts.map(factToRagChunk),
      ...chunks.map(chunkToRagChunk),
    ];

    return {
      citations: toCitations(
        entries.map((entry) => ({
          documentId: entry.documentId!,
          documentName: entry.documentName,
          content: entry.content,
          sourceUrl: entry.sourceUrl ?? null,
        })),
      ),
      contextBlock: formatContextBlock(entries),
      chunks: entries,
    };
  };
}
