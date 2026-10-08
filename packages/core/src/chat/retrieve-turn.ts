import type { Assistant } from '@wbfm/shared/types';
import { traceAsync, type TraceHandle } from '@wbfm/ai';
import type { OrchestratorEvent, RagContext, RagRetriever } from './types';
import type { ConversationService } from '../services/conversation-service';
import { RAG_SNIPPET_LIMIT, normalizeFailure } from './orchestrator-helpers';

export interface RetrieveOutcome {
  retrieved: RagContext | null;
  /** 非 abort 错误：已产出 error 事件，编排器应结束本轮 */
  failed: boolean;
  aborted: boolean;
}

/**
 * 兼容路径：助手绑定知识库且 retrieveAlways 时，开流前强制检索（v0.1 行为）。
 * 自主检索（knowledge_search 工具）不经过这里。
 */
export async function* runAlwaysRetrieval(params: {
  assistant: Assistant;
  userContent: string;
  retrieve: RagRetriever | undefined;
  signal: AbortSignal | undefined;
  traceParent: TraceHandle | null;
  assistantMessageId: string;
  conversations: ConversationService;
}): AsyncGenerator<OrchestratorEvent, RetrieveOutcome> {
  const { assistant, userContent, retrieve, signal, traceParent, assistantMessageId, conversations } =
    params;
  let retrieved: RagContext | null = null;
  try {
    if (retrieve && assistant.knowledgeBaseId && assistant.retrieveAlways) {
      retrieved = await traceAsync(
        {
          name: 'knowledge_search',
          runType: 'retriever',
          parent: traceParent,
          inputs: { query: userContent, knowledgeBaseId: assistant.knowledgeBaseId },
        },
        () => retrieve(userContent, assistant, signal),
        (result) =>
          result
            ? {
                citationCount: result.citations.length,
                citations: result.citations.map((c) => ({
                  documentId: c.documentId,
                  ordinal: c.ordinal,
                  snippet: c.snippet?.slice(0, RAG_SNIPPET_LIMIT) ?? '',
                })),
              }
            : { citationCount: 0 },
      );
      if (retrieved?.citations.length) {
        yield { event: 'citations', data: { citations: retrieved.citations } };
      }
    }
  } catch (error) {
    if (signal?.aborted) {
      conversations.stopMessage(assistantMessageId, '');
      yield { event: 'done', data: { content: '', usage: null } };
      return { retrieved: null, failed: false, aborted: true };
    }
    const failure = normalizeFailure(error);
    conversations.markMessageError(assistantMessageId, failure.code, failure.message);
    yield { event: 'error', data: failure };
    return { retrieved: null, failed: true, aborted: false };
  }
  return { retrieved, failed: false, aborted: false };
}
