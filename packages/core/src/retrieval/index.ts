/** @域 barrel RAG 检索（v1.1 M2 域子路径化） */
export {
  createRetrievalService,
  DEFAULT_RETRIEVAL_TOP_K,
  type RetrievalService,
  type RetrievedChunk,
  type RetrieveInput,
} from './retrieval-service';
export { createRagRetriever } from './rag-retriever';
export {
  formatContextBlock,
  toCitations,
  CITATION_SNIPPET_LENGTH,
} from './context-formatter';
