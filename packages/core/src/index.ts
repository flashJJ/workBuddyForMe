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
  createPermissionService,
  type PermissionService,
} from './services/permission-service';
export {
  createPendingConfirmations,
  CONFIRMATION_TIMEOUT_MS,
  type PendingConfirmations,
  type ConfirmationDecision,
} from './services/pending-confirmations';
export {
  createTaskGrantRegistry,
  type TaskGrantRegistry,
} from './services/task-grants';
export {
  createTaskRunnerService,
  type TaskRunnerService,
  type TaskStartParams,
} from './services/task-runner-service';
export {
  runTaskLoop,
} from './agent/task-loop';
export {
  createTaskLoopControl,
  type TaskLoopControl,
  type TaskLoopEvent,
  type TaskLoopParams,
} from './agent/control';
export {
  createLlmPlanner,
  TASK_PLANNER_SYSTEM_PROMPT,
  buildPlannerMessages,
  parseDecision,
  PlannerParseError,
} from './agent/llm-planner';
export type {
  TaskPlanner,
  TaskPlannerInput,
  TaskPlanDecision,
  TaskObservation,
} from './agent/types';
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
export {
  PROACTIVE_HISTORY_MESSAGES,
  PROACTIVE_TRIGGER_PROMPT,
  PROACTIVE_MESSAGE_PREFIX,
  createProactiveMessageId,
  createProactiveTurn,
  type StreamProactiveInput,
} from './chat/proactive-turn';
export { resolveChatTarget, resolveChatTargetForModelId, type ResolvedChatTarget } from './chat/model-resolver';
export { buildChatMessages, buildSystemPrompt, type ChatBudgetOptions } from './chat/prompt';
export {
  estimateTokens,
  estimateMessageTokens,
  assembleHistoryWithinBudget,
  resolveReserveTokens,
  IMAGE_TOKEN_ESTIMATE,
  type HistoryBudgetStats,
} from './chat/context-budget';
export {
  planCompaction,
  buildSummaryMessages,
  normalizeSummary,
  summarizeConversation,
  type CompactionPlan,
  type CompactionPlanInput,
} from './chat/summarizer';
export { compactIfNeeded, type CompactionResult } from './chat/turn-context';
export type {
  OrchestratorEvent,
  StreamChatInput,
  RagChunk,
  RagContext,
  RagRetriever,
  StreamResult,
} from './chat/types';

// v0.5 M3 长期记忆
export { createMemoryService, type MemoryService } from './memory/memory-service';
export { extractTurnMemories, parseExtractedMemories, type ExtractedMemory } from './memory/extractor';
export { formatMemoryBlock, toRecalledPayload } from './memory/turn-memory';

// 知识库摄入
export { createIngestionPipeline, type IngestionPipeline } from './ingestion/ingestion-pipeline';
export { chunkText } from './ingestion/chunking';
export {
  readDocumentText,
  detectKind,
  readPdfPageTexts,
  isImagePdf,
  pageNeedsOcr,
  mergePdfTextItems,
} from './ingestion/read-document';
export {
  resolveEmbeddingTarget,
  type ResolvedEmbeddingTarget,
} from './ingestion/embedding-target';
export {
  extractDocumentText,
  type ExtractDocumentResult,
  type ExtractHooks,
} from './ingestion/extract-with-ocr';
export { runPdfOcr, type OcrRunResult } from './ingestion/ocr-runner';
export {
  resolveVisionTarget,
  type ResolvedVisionTarget,
} from './ingestion/vision-target';
export { renderPdfPagesToPng } from './ingestion/pdf-render';
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
export { createToolRuntime, type ToolRuntime, type ResolvedTool, type DebugToolInfo } from './tools/tool-runtime';
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
export { extractMainContent } from './tools/html-extractor';
// v0.7 M1 屏幕感知
export {
  createComputerChannelClient,
  ChannelUnavailableError,
  type ComputerChannelClient,
} from './computer/channel-client';
export {
  createScreenSnapshotTool,
  screenSnapshotTool,
} from './tools/computer/screen-snapshot-tool';
export type { ToolResultImage } from './tools/types';
export {
  createToolBreaker,
  type ToolBreaker,
  type ToolBreakerSnapshot,
  type ToolBreakerOptions,
  type BreakerStatus,
} from './tools/tool-breaker';
export {
  debugExecuteTool,
  DEBUG_MCP_TIMEOUT_MS,
  type DebugExecuteParams,
} from './tools/debug-executor';
export {
  isBlockedIp,
  assertSafeUrlLiteral,
  resolveAndAssertHost,
  ipv4ToInt,
  parseIpv6,
  SsrfBlockedError,
} from './tools/ssrf-guard';
export { runProviderTurn, type ProviderTurn, type TurnParams } from './chat/tool-runner';

// v0.6 MCP（Model Context Protocol）
export * from './mcp';

// v0.9 Flow Serving（本地 API/MCP 端点）
export { ENDPOINT_KEY_PREFIX, generateEndpointKey, hashEndpointKey, endpointKeyPreview, verifyEndpointKey, type GeneratedEndpointKey } from './serving/endpoint-keys';
export { createRateLimiter, type RateLimiter, type RateLimitDecision } from './serving/rate-limiter';
export { readFlowStartFields, validateFlowStartInput, StartInputValidationError } from './serving/start-input';
export {
  createEndpointService, PublicEndpointError, type EndpointService, type EndpointServiceDeps,
  type EndpointConfigInput, type EndpointTransport, type PublicErrorCode, type UpsertEndpointResult,
} from './serving/endpoint-service';
export { scanFlowDangerNodes, type FlowDangerNode } from './serving/danger-scan';
export { createFlowServingStack, type FlowServingStack, type FlowServingStackOptions } from './serving/create-serving-stack';

// v0.6 M3 本地技能包
export { loadSkillsFromDisk } from './skills/loader';
export {
  BUILTIN_SKILLS,
  BUILTIN_MEETING_NOTES,
  BUILTIN_WEEKLY_REPORT,
  BUILTIN_FILE_SEARCH,
  ensureBuiltinSkills,
} from './skills/builtin-skills';
export {
  createSkillService,
  type EnabledSkill,
  type SkillService,
  type SkillServiceOptions,
} from './skills/skill-service';
export { buildSkillPromptBlock, mergeSkillAllowedTools } from './skills/skill-assembly';

// v0.4 数据便携：备份与恢复
export {
  exportBackup,
  sanitizeSettings,
  BACKUP_MAX_ARCHIVE_BYTES,
  type BackupExportOptions,
  type BackupExportResult,
} from './backup/export';
export {
  restoreBackup,
  precheckBackup,
  type BackupRestoreOptions,
  type BackupRestoreResult,
} from './backup/restore';

// v0.4 对话分享
export { buildConversationSnapshot } from './share/export-conversation';
export {
  sanitizeShareText,
  sanitizeSnapshot,
  REDACTED,
  type ConversationSnapshot,
  type SharedMessage,
  type SharedPart,
} from './share/snapshot';

// v0.8 Flow Studio 可视化工作流（根桶只导出对外服务面；引擎/处理器等内部件见 ./flow）
export { compileFlow, type CompileResult } from './flow';
export {
  createFlowRunService,
  type FlowRunService,
  type FlowRunServiceDeps,
  type CreateRunParams,
  createFlowEventBus,
  createFlowRunQueue,
  recoverInterruptedRuns,
  type FlowEventBus,
  type FlowRunQueue,
  type RecoveryResult,
} from './flow';
export {
  STARTER_FLOWS,
  ensureStarterFlows,
  flowEventToSubstep,
  type StarterFlowDef,
} from './flow';
