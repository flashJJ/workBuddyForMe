// 错误模型
export { ERROR_CODES, httpStatusFor, type ErrorCode } from './errors/error-codes';
export { ApiError, type ApiErrorBody } from './errors/api-error';

// 常量与领域类型
export * from './constants';
export type {
  Provider,
  ProviderModel,
  Assistant,
  Conversation,
  Message,
  Citation,
  KnowledgeBase,
  DocumentRecord,
  AppSettings,
  Timestamped,
} from './types/domain';
export type { ToolTraceEntry, ToolEventPayload, ToolCallStatus } from './types/tool';

// Zod 契约
export * from './schemas/common';
export {
  providerProtocolSchema,
  providerCreateSchema,
  providerUpdateSchema,
  providerTestSchema,
  type ProviderCreateInput,
  type ProviderUpdateInput,
  type ProviderTestInput,
} from './schemas/provider';
export { modelCapabilitySchema, modelCreateSchema, type ModelCreateInput } from './schemas/model';
export {
  assistantCreateSchema,
  assistantUpdateSchema,
  assistantReorderSchema,
  type AssistantCreateInput,
  type AssistantUpdateInput,
  type AssistantReorderInput,
} from './schemas/assistant';
export {
  conversationCreateSchema,
  conversationUpdateSchema,
  chatRequestSchema,
  type ConversationCreateInput,
  type ConversationUpdateInput,
  type ChatRequest,
} from './schemas/conversation';
export {
  knowledgeBaseCreateSchema,
  knowledgeBaseUpdateSchema,
  type KnowledgeBaseCreateInput,
  type KnowledgeBaseUpdateInput,
} from './schemas/knowledge';
export { settingsUpdateSchema, type SettingsUpdateInput } from './schemas/settings';

// API 契约
export {
  ok,
  fail,
  unwrapEnvelope,
  type ApiEnvelope,
  type ApiSuccess,
  type ApiFailure,
} from './api/envelope';
export {
  SSE_EVENT,
  formatSse,
  type SseEventName,
  type SsePayloadMap,
  type TokenUsage,
} from './api/sse';
