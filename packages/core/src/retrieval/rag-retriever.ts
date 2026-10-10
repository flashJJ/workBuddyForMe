import type { Assistant } from '@wbfm/shared/types';
import { createSettingsRepository } from '@wbfm/database';
import type { RagContext, RagRetriever } from '../chat/types';
import type { ServiceDeps } from '../services/deps';
import { formatContextBlock, toCitations } from './context-formatter';
import {
  createRetrievalService,
  DEFAULT_MAX_CHUNKS,
  DEFAULT_MIN_VEC_SIMILARITY,
  type RetrievalOptions,
} from './retrieval-service';

const SETTINGS_KEY = 'app-settings';

/** 从 app-settings 读取知识检索选项（缺省值与检索层默认一致：混合开启） */
function readRetrievalOptions(deps: ServiceDeps): RetrievalOptions {
  const raw = createSettingsRepository(deps.db).getJson(SETTINGS_KEY, null) as
    | {
        hybridRetrievalEnabled?: boolean;
        retrievalMinSimilarity?: number;
        retrievalMaxChunks?: number;
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
  };
}

/**
 * 构造对话编排使用的 RAG 钩子：
 * 助手绑定知识库时按设置做混合检索；空结果 / 未配置 embedding 时返回 null（退化为普通对话）。
 */
export function createRagRetriever(deps: ServiceDeps): RagRetriever {
  const retrieval = createRetrievalService(deps);

  return async (
    question: string,
    assistant: Assistant,
    signal?: AbortSignal,
  ): Promise<RagContext | null> => {
    if (!assistant.knowledgeBaseId) return null;
    const chunks = await retrieval.retrieve(
      {
        knowledgeBaseId: assistant.knowledgeBaseId,
        query: question,
        signal,
      },
      readRetrievalOptions(deps),
    );
    if (chunks.length === 0) return null;
    return {
      citations: toCitations(chunks),
      contextBlock: formatContextBlock(chunks),
      chunks: chunks.map((chunk) => ({
        documentName: chunk.documentName,
        ordinal: chunk.ordinal,
        content: chunk.content,
      })),
    };
  };
}
