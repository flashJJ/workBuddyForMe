import type {
  DocumentSource,
  DocumentStatus,
  MessageRole,
  MessageStatus,
  ModelCapability,
  ProviderProtocol,
  Theme,
  ToolName,
} from '../constants';
import type { ContentPart } from './content-part';
import type { ToolTraceEntry } from './tool';

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
  /** v0.2：可用工具白名单（空数组 = 纯对话，与 v0.1 行为一致） */
  enabledTools: ToolName[];
  /** v0.2：绑定知识库时是否每轮强制检索（兼容开关；关闭后由模型经 knowledge_search 自主决策） */
  retrieveAlways: boolean;
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
  /** v0.2：本轮工具调用轨迹（过程展示/上下文重建用） */
  toolTrace: ToolTraceEntry[];
  /** v0.3：多模态片段（空数组 = 纯文本消息，回落 content） */
  contentParts: ContentPart[];
  errorCode: string | null;
  errorMessage: string | null;
  createdAt: string;
}

/** v0.3 聊天图片附件元数据（文件本体存数据根 attachments/，不入库） */
export interface Attachment {
  id: string;
  filename: string;
  mimeType: string;
  byteSize: number;
  contentHash: string;
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
  /** v0.3：upload=本地上传，webpage=网页剪藏 */
  source: DocumentSource;
  /** v0.3：剪藏来源页地址，本地上传为 null */
  sourceUrl: string | null;
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
