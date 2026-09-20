import type {
  DocumentStatus,
  MessageRole,
  MessageStatus,
  ModelCapability,
  ProviderProtocol,
  Theme,
} from '../constants';

export interface Timestamped {
  createdAt: string;
  updatedAt: string;
}

export interface Provider extends Timestamped {
  id: string;
  name: string;
  protocol: ProviderProtocol;
  baseUrl: string;
  /** 脱敏后的 Key（如 sk-****ab12），未配置时为 null */
  apiKeyMasked: string | null;
  enabled: boolean;
  sortOrder: number;
}

export interface ProviderModel {
  id: string;
  providerId: string;
  modelId: string;
  displayName: string;
  capabilities: ModelCapability[];
  contextWindow: number | null;
  createdAt: string;
}

export interface Assistant extends Timestamped {
  id: string;
  name: string;
  emoji: string | null;
  color: string | null;
  systemPrompt: string;
  temperature: number;
  topP: number;
  maxTokens: number | null;
  /** 绑定 models.id；null 表示跟随系统默认对话模型 */
  modelId: string | null;
  /** 绑定 knowledge_bases.id；非空时对话自动 RAG */
  knowledgeBaseId: string | null;
  isBuiltin: boolean;
  sortOrder: number;
}

export interface Conversation extends Timestamped {
  id: string;
  assistantId: string;
  title: string;
  lastMessageAt: string | null;
}

export interface Citation {
  documentId: string;
  documentName: string;
  ordinal: number;
  snippet?: string;
}

export interface Message {
  id: string;
  conversationId: string;
  role: MessageRole;
  content: string;
  status: MessageStatus;
  promptTokens: number | null;
  completionTokens: number | null;
  totalTokens: number | null;
  citations: Citation[];
  errorCode: string | null;
  errorMessage: string | null;
  createdAt: string;
}

export interface KnowledgeBase extends Timestamped {
  id: string;
  name: string;
  description: string;
  chunkSize: number;
  chunkOverlap: number;
  documentCount: number;
}

export interface DocumentRecord {
  id: string;
  knowledgeBaseId: string;
  filename: string;
  fileType: string;
  byteSize: number;
  contentHash: string;
  status: DocumentStatus;
  errorMessage: string | null;
  chunkCount: number;
  createdAt: string;
  indexedAt: string | null;
}

export interface AppSettings {
  defaultChatModelId: string | null;
  defaultEmbeddingModelId: string | null;
  theme: Theme;
  language: 'zh-CN';
}
