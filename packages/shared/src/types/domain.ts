import type {
  DocumentSource,
  DocumentStatus,
  McpServerStatus,
  McpTransport,
  MessageFeedback,
  MessageRole,
  MessageStatus,
  ModelCapability,
  OcrEngine,
  OcrStatus,
  ProviderProtocol,
  Theme,
} from '../constants';
import type { ContentPart } from './content-part';
import type { PermissionLevel } from './permission';
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

/**
 * 供应商远端模型发现项（v0.5）：
 * contextLength 为自动探测的上下文长度（tokens），无法探测时为 null。
 */
export interface DiscoveredModel {
  id: string;
  contextLength: number | null;
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
  /**
   * v0.2：可用工具白名单（空数组 = 纯对话，与 v0.1 行为一致）。
   * v0.6：元素为内置工具名或 mcp:<server>:<tool> 命名空间名。
   */
  enabledTools: string[];
  /** v0.2：绑定知识库时是否每轮强制检索（兼容开关；关闭后由模型经 knowledge_search 自主决策） */
  retrieveAlways: boolean;
  /** v0.5：该助手是否启用长期记忆提取/召回（默认开） */
  memoryEnabled: boolean;
  /** v1.0 M3：回复中允许插入 [joy] 等表情指令标签（驱动 Live2D 形象；默认开） */
  expressionEnabled: boolean;
  isBuiltin: boolean;
  sortOrder: number;
}

export interface Conversation extends Timestamped {
  id: string;
  assistantId: string;
  title: string;
  lastMessageAt: string | null;
  /** v0.5：较早轮次的递归摘要（NULL=未压缩），随 system prompt 注入 */
  summary: string | null;
  /** v0.5：已折叠进摘要的最早消息条数（累计） */
  summaryTurns: number;
}

export interface Citation {
  documentId: string;
  documentName: string;
  ordinal: number;
  snippet?: string;
  /** v0.3：网页剪藏来源；存在时引用角标可悬停看 URL、点击新开原文 */
  sourceUrl?: string | null;
}

/** v0.5 长期记忆类别：事实 / 偏好 / 事件 */
export const MEMORY_KINDS = ['fact', 'preference', 'event'] as const;
export type MemoryKind = (typeof MEMORY_KINDS)[number];

/** active=参与召回；archived=软遗忘（P1，暂不自动产生，UI 可见） */
export const MEMORY_STATUSES = ['active', 'archived'] as const;
export type MemoryStatus = (typeof MEMORY_STATUSES)[number];

/** v0.5 长期记忆条目 */
export interface Memory extends Timestamped {
  /** 整型主键（同时作为 sqlite-vec rowid），对外以字符串传递 */
  id: string;
  kind: MemoryKind;
  content: string;
  /** 模型打分 0~1，越高越值得长期保留 */
  importance: number;
  /** 提取来源会话（可空：手工创建无来源） */
  sourceConversationId: string | null;
  status: MemoryStatus;
  lastAccessedAt: string | null;
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
  /** v0.5 P1-2：用户对回答的反馈（仅助手消息）；再次点击同项取消 */
  feedback: MessageFeedback | null;
  feedbackAt: string | null;
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
  /** v0.4：OCR 状态；非扫描件为 null */
  ocrStatus: OcrStatus | null;
  /** v0.4：实际使用的 OCR 引擎；未走 OCR 为 null */
  ocrEngine: OcrEngine | null;
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

/** v0.6 MCP 服务器配置（mcp_servers 表行；stdio/http 字段按 transport 取用） */
export interface McpServerConfig extends Timestamped {
  id: string;
  transport: McpTransport;
  /** 标识符安全的命名空间名（唯一），工具限定名用它构建 */
  name: string;
  /** stdio：启动命令 */
  command: string;
  /** stdio：启动参数 */
  args: string[];
  /** stdio：环境变量白名单（叠加在继承环境之上） */
  env: Record<string, string>;
  /** http（M2）：Streamable HTTP 端点 */
  url: string;
  /** http（M2）：附加请求头 */
  headers: Record<string, string>;
  enabled: boolean;
}

/** 设置页/助手表单看到的服务器视图 = 配置 + 连接状态 */
export interface McpServerInfo extends McpServerConfig {
  status: McpServerStatus;
  /** 最近一次错误原因或握手摘要；正常连接时为 null */
  statusDetail: string | null;
  /** 已发现的工具数（仅 connected 时有意义） */
  toolCount: number;
}

/** MCP 服务器发现的工具（注册进工具运行时前的元数据） */
export interface McpToolInfo {
  serverName: string;
  /** 服务器内的原始工具名 */
  name: string;
  /** 全局限定名 mcp:<server>:<tool>，模型侧 function 名 */
  qualifiedName: string;
  description: string;
  /** MCP inputSchema（JSON Schema），透传为 function parameters */
  inputSchema: Record<string, unknown>;
}

// ── v0.6 M3 本地技能包 ──

/** 技能包 manifest 中的单段提示词模板 */
export interface SkillPromptTemplate {
  name: string;
  order: number;
  content: string;
}

/** 技能包 manifest 中的使用示例 */
export interface SkillExample {
  title: string;
  userQuery: string;
  expectedBehavior?: string;
}

/** skill.json 的内存表示（zod 校验后） */
export interface SkillManifest {
  name: string;
  description: string;
  version: string;
  permissions: PermissionLevel[];
  promptTemplates: SkillPromptTemplate[];
  allowedTools: string[];
  examples: SkillExample[];
  author?: string;
}

/** 技能包在数据根 skills/<name>/ 目录下的磁盘表示 */
export interface SkillDiskEntry {
  /** 文件夹名（= manifest name） */
  name: string;
  /** manifest 绝对路径 */
  manifestPath: string;
  /** 文件夹绝对路径 */
  directoryPath: string;
  /** 加载/校验结果 */
  manifest: SkillManifest | null;
  /** 加载失败时给出具体原因 */
  error: string | null;
}

/** 启停状态（持久化在 skills_state 表） */
export interface SkillState extends Timestamped {
  id: string;
  /** 技能名（与磁盘文件夹名一致，唯一键） */
  name: string;
  /** 用户是否启用该技能 */
  enabled: boolean;
  /** 技能源文件夹绝对路径（搬迁或重装后可能失效，UI 应标红） */
  sourcePath: string;
}

/** 设置页技能列表视图 = skills_state 行 + 磁盘扫描结果（API 返回） */
export interface SkillInfo {
  /** skills_state 行 id（启停/删除引用用） */
  id: string;
  name: string;
  enabled: boolean;
  sourcePath: string;
  /** manifest 校验通过时为解析结果；失败或文件夹缺失为 null */
  manifest: SkillManifest | null;
  /** 加载/校验失败的具体原因；正常为 null */
  error: string | null;
  /** 源文件夹是否存在（false = 引用残留，UI 标红提示） */
  exists: boolean;
}
