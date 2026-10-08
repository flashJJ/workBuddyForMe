/** @域 barrel 对话编排/预算/压缩（v1.1 M2 域子路径化） */
export { createChatOrchestrator, type ChatOrchestrator } from './chat-orchestrator';
export {
  PROACTIVE_HISTORY_MESSAGES,
  PROACTIVE_TRIGGER_PROMPT,
  PROACTIVE_MESSAGE_PREFIX,
  createProactiveMessageId,
  createProactiveTurn,
  type StreamProactiveInput,
} from './proactive-turn';
export { resolveChatTarget, resolveChatTargetForModelId, type ResolvedChatTarget } from './model-resolver';
export { buildChatMessages, buildSystemPrompt, type ChatBudgetOptions } from './prompt';
export {
  estimateTokens,
  estimateMessageTokens,
  assembleHistoryWithinBudget,
  resolveReserveTokens,
  resolveToolMessageBudget,
  IMAGE_TOKEN_ESTIMATE,
  type HistoryBudgetStats,
} from './context-budget';
export {
  planCompaction,
  buildSummaryMessages,
  normalizeSummary,
  summarizeConversation,
  type CompactionPlan,
  type CompactionPlanInput,
} from './summarizer';
export { compactIfNeeded, type CompactionResult } from './turn-context';
export { runProviderTurn, type ProviderTurn, type TurnParams } from './tool-runner';
export type {
  OrchestratorEvent,
  StreamChatInput,
  RagChunk,
  RagContext,
  RagRetriever,
  StreamResult,
} from './types';
