import { randomUUID } from 'node:crypto';
import type {
  Assistant,
  Citation,
  ContentPart,
  Conversation,
  DocumentRecord,
  KnowledgeBase,
  Message,
  MessageRole,
  MessageStatus,
  ModelCapability,
  Provider,
  ProviderModel,
  ProviderProtocol,
  ToolName,
  ToolTraceEntry,
} from '@wbfm/shared';
import { nowIso } from '../utils/time';

/** 仓储对外暴露的供应商记录（不含密文；hasApiKey 供服务层判断） */
export interface ProviderRecord extends Omit<Provider, 'apiKeyMasked'> {
  hasApiKey: boolean;
}

export interface ProviderRow {
  id: string;
  name: string;
  protocol: ProviderProtocol;
  base_url: string;
  api_key_cipher: string | null;
  enabled: number;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface ModelRow {
  id: string;
  provider_id: string;
  model_id: string;
  display_name: string;
  capabilities: string;
  context_window: number | null;
  created_at: string;
}

export interface AssistantRow {
  id: string;
  name: string;
  emoji: string | null;
  color: string | null;
  system_prompt: string;
  temperature: number;
  top_p: number;
  max_tokens: number | null;
  model_id: string | null;
  knowledge_base_id: string | null;
  enabled_tools: string;
  retrieve_always: number;
  is_builtin: number;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface ConversationRow {
  id: string;
  assistant_id: string;
  title: string;
  last_message_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface MessageRow {
  id: string;
  conversation_id: string;
  role: MessageRole;
  content: string;
  status: MessageStatus;
  prompt_tokens: number | null;
  completion_tokens: number | null;
  total_tokens: number | null;
  citations: string;
  tool_trace: string;
  content_parts: string;
  error_code: string | null;
  error_message: string | null;
  created_at: string;
}

export interface KnowledgeBaseRow {
  id: string;
  name: string;
  description: string;
  chunk_size: number;
  chunk_overlap: number;
  created_at: string;
  updated_at: string;
  document_count: number;
}

export interface DocumentRow {
  id: string;
  knowledge_base_id: string;
  filename: string;
  file_type: string;
  byte_size: number;
  content_hash: string;
  status: DocumentRecord['status'];
  source: DocumentRecord['source'];
  source_url: string | null;
  ocr_status: DocumentRecord['ocrStatus'];
  ocr_engine: DocumentRecord['ocrEngine'];
  error_message: string | null;
  chunk_count: number;
  created_at: string;
  indexed_at: string | null;
}

export function newId(): string {
  return randomUUID();
}

function parseJsonArray<T>(raw: string): T[] {
  try {
    const value = JSON.parse(raw);
    return Array.isArray(value) ? (value as T[]) : [];
  } catch {
    return [];
  }
}

export function mapProvider(row: ProviderRow): ProviderRecord {
  return {
    id: row.id,
    name: row.name,
    protocol: row.protocol,
    baseUrl: row.base_url,
    enabled: row.enabled === 1,
    sortOrder: row.sort_order,
    hasApiKey: row.api_key_cipher !== null && row.api_key_cipher !== '',
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function mapModel(row: ModelRow): ProviderModel {
  return {
    id: row.id,
    providerId: row.provider_id,
    modelId: row.model_id,
    displayName: row.display_name,
    capabilities: parseJsonArray<ModelCapability>(row.capabilities),
    contextWindow: row.context_window,
    createdAt: row.created_at,
  };
}

export function mapAssistant(row: AssistantRow): Assistant {
  return {
    id: row.id,
    name: row.name,
    emoji: row.emoji,
    color: row.color,
    systemPrompt: row.system_prompt,
    temperature: row.temperature,
    topP: row.top_p,
    maxTokens: row.max_tokens,
    modelId: row.model_id,
    knowledgeBaseId: row.knowledge_base_id,
    enabledTools: parseJsonArray<ToolName>(row.enabled_tools),
    retrieveAlways: row.retrieve_always === 1,
    isBuiltin: row.is_builtin === 1,
    sortOrder: row.sort_order,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function mapConversation(row: ConversationRow): Conversation {
  return {
    id: row.id,
    assistantId: row.assistant_id,
    title: row.title,
    lastMessageAt: row.last_message_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function mapMessage(row: MessageRow): Message {
  return {
    id: row.id,
    conversationId: row.conversation_id,
    role: row.role,
    content: row.content,
    status: row.status,
    promptTokens: row.prompt_tokens,
    completionTokens: row.completion_tokens,
    totalTokens: row.total_tokens,
    citations: parseJsonArray<Citation>(row.citations),
    toolTrace: parseJsonArray<ToolTraceEntry>(row.tool_trace),
    contentParts: parseJsonArray<ContentPart>(row.content_parts),
    errorCode: row.error_code,
    errorMessage: row.error_message,
    createdAt: row.created_at,
  };
}

export function mapKnowledgeBase(row: KnowledgeBaseRow): KnowledgeBase {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    chunkSize: row.chunk_size,
    chunkOverlap: row.chunk_overlap,
    documentCount: row.document_count,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function mapDocument(row: DocumentRow): DocumentRecord {
  return {
    id: row.id,
    knowledgeBaseId: row.knowledge_base_id,
    filename: row.filename,
    fileType: row.file_type,
    byteSize: row.byte_size,
    contentHash: row.content_hash,
    status: row.status,
    source: row.source,
    sourceUrl: row.source_url,
    ocrStatus: row.ocr_status,
    ocrEngine: row.ocr_engine,
    errorMessage: row.error_message,
    chunkCount: row.chunk_count,
    createdAt: row.created_at,
    indexedAt: row.indexed_at,
  };
}

export { nowIso };
