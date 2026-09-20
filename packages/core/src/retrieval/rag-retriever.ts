import type { Assistant } from '@wbfm/shared';
import type { RagContext, RagRetriever } from '../chat/types';
import type { ServiceDeps } from '../services/deps';
import { formatContextBlock, toCitations } from './context-formatter';
import { createRetrievalService, DEFAULT_RETRIEVAL_TOP_K } from './retrieval-service';

/**
 * 构造对话编排使用的 RAG 钩子：
 * 助手绑定知识库时检索 top-k；空结果 / 未配置 embedding 时返回 null（退化为普通对话）。
 */
export function createRagRetriever(deps: ServiceDeps): RagRetriever {
  const retrieval = createRetrievalService(deps);

  return async (
    question: string,
    assistant: Assistant,
    signal?: AbortSignal,
  ): Promise<RagContext | null> => {
    if (!assistant.knowledgeBaseId) return null;
    const chunks = await retrieval.retrieve({
      knowledgeBaseId: assistant.knowledgeBaseId,
      query: question,
      topK: DEFAULT_RETRIEVAL_TOP_K,
      signal,
    });
    if (chunks.length === 0) return null;
    return {
      citations: toCitations(chunks),
      contextBlock: formatContextBlock(chunks),
    };
  };
}
