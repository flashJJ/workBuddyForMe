// 密钥
export {
  createWebCipher,
  createBridgedCipher,
  maskSecret,
  type SecretCipher,
  type SafeStorageBridge,
} from './secrets/cipher';
export { sealWithKey, openWithKey } from './secrets/crypto-box';
export { loadOrCreateMasterKey, MASTER_KEY_FILENAME } from './secrets/master-key';

// 服务
export type { ServiceDeps } from './services/deps';
export { createProviderService, type ProviderService } from './services/provider-service';
export { createModelService, type ModelService } from './services/model-service';
export { buildProvider, toApiError } from './services/provider-adapter';
export {
  createSettingsService,
  DEFAULT_SETTINGS,
  type SettingsService,
} from './services/settings-service';
export {
  createAssistantsService,
  type AssistantsService,
} from './services/assistant-service';
export { ensureSeedData, BUILTIN_ASSISTANT } from './services/seed';
export { createKnowledgeService, type KnowledgeService } from './services/knowledge-service';
export {
  createDocumentService,
  hashContent,
  type DocumentService,
  type UploadedFile,
} from './services/document-service';
export {
  createConversationService,
  deriveTitle,
  type ConversationService,
} from './services/conversation-service';
export {
  createAttachmentService,
  type AttachmentService,
  type AttachmentInput,
  type ResolvedImage,
} from './services/attachment-service';

// 对话编排
export { createChatOrchestrator, type ChatOrchestrator } from './chat/chat-orchestrator';
export { resolveChatTarget, type ResolvedChatTarget } from './chat/model-resolver';
export { buildChatMessages, buildSystemPrompt, HISTORY_MESSAGE_LIMIT } from './chat/prompt';
export type {
  OrchestratorEvent,
  StreamChatInput,
  RagContext,
  RagRetriever,
  StreamResult,
} from './chat/types';

// 知识库摄入
export { createIngestionPipeline, type IngestionPipeline } from './ingestion/ingestion-pipeline';
export { chunkText } from './ingestion/chunking';
export { readDocumentText, detectKind } from './ingestion/read-document';
export {
  resolveEmbeddingTarget,
  type ResolvedEmbeddingTarget,
} from './ingestion/embedding-target';
export type {
  IngestInput,
  IngestResult,
  DocumentKind,
  ChunkSlice,
  ChunkOptions,
} from './ingestion/types';

// RAG 检索
export {
  createRetrievalService,
  DEFAULT_RETRIEVAL_TOP_K,
  type RetrievalService,
  type RetrievedChunk,
  type RetrieveInput,
} from './retrieval/retrieval-service';
export { createRagRetriever } from './retrieval/rag-retriever';
export {
  formatContextBlock,
  toCitations,
  CITATION_SNIPPET_LENGTH,
} from './retrieval/context-formatter';

// v0.2 工具调用
export { createToolRuntime, type ToolRuntime } from './tools/tool-runtime';
export {
  executeToolCall,
  executeCall,
  parseToolArgs,
  summarizeArgs,
  clipSummary,
} from './tools/tool-executor';
export {
  toToolDefinitions,
  ToolArgError,
  type Tool,
  type ToolResult,
  type ToolContext,
  type ToolMap,
} from './tools/types';
export { currentTimeTool } from './tools/current-time-tool';
export { knowledgeSearchTool } from './tools/knowledge-search-tool';
export { fetchWebpageTool, htmlToText } from './tools/fetch-webpage-tool';
export {
  isBlockedIp,
  assertSafeUrlLiteral,
  resolveAndAssertHost,
  ipv4ToInt,
  parseIpv6,
  SsrfBlockedError,
} from './tools/ssrf-guard';
export { runProviderTurn, type ProviderTurn, type TurnParams } from './chat/tool-runner';
