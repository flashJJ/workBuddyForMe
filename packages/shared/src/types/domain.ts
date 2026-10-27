import type {
  DocumentSource,
  DocumentStatus,
  MessageFeedback,
  MessageRole,
  MessageStatus,
  ModelCapability,
  OcrEngine,
  OcrStatus,
  ProviderProtocol,
  Theme,
  ThemeId,
  Language,
} from '../constants';
import type { ContentPart } from './content-part';
import type { EventSettingsFields } from '../events/event-settings';
import type { LocalModeSettingsFields } from './local-mode-settings';
import type { InteractionGraphEntry } from '../schemas/interaction-graph';
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
  /** v1.4：协作三角色模型覆盖（null=逐级回落：角色覆盖→助手 modelId→系统默认） */
  plannerModelId: string | null; executorModelId: string | null; reviewerModelId: string | null;
  /** v1.5：绑定 knowledge_bases.id（支持多库联合检索）；空数组=纯对话 */
  knowledgeBaseIds: string[];
  /**
   * v0.2：可用工具白名单（空数组 = 纯对话，与 v0.1 行为一致）。
   * v0.6：元素为内置工具名或 mcp:<server>:<tool> 命名空间名。
   */
  enabledTools: string[];
  /**
   * v2.4 M4（P1-2）：助手级技能勾选（技能 name）。
   * 空数组 = 跟随全局（设置页全部已启用技能）；非空 = 只注入这些（仍需全局启用）。
   */
  skillNames: string[];
  /** v0.2：绑定知识库时是否每轮强制检索（兼容开关；关闭后由模型经 knowledge_search 自主决策） */
  retrieveAlways: boolean;
  /** v0.5：该助手是否启用长期记忆提取/召回（默认开） */
  memoryEnabled: boolean;
  /** v1.0 M3：回复中允许插入 [joy] 等表情指令标签（驱动 Live2D 形象；默认开） */
  expressionEnabled: boolean;
  /** v1.7：人格四权重 0..1（v024 列，老库默认 0.5；驱动剧情 branch 支线） */
  personalityFrankness: number;
  personalityTsundere: number;
  personalityShy: number;
  personalityTolerance: number;
  /** v1.8：当前选用的角色卡 id（v026 列；null=默认卡） */
  cardId: string | null;
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
  /** v1.3：PDF 页码/文档段号（从 1；无则 null）+ 分片字符区间（静态条目可缺省） */
  pageNo?: number | null;
  paragraphNo?: number | null;
  charStart?: number;
  charEnd?: number;
  /** v1.3：引用来源层——普通分片/实体原句/文档要点（缺省视同 chunk） */
  staticKind?: 'chunk' | 'entity' | 'summary';
}

// v2.6：长期记忆类型迁至 ./memory（domain 重新导出保持公开面不变）
export { MEMORY_KINDS, MEMORY_STATUSES, MEMORY_RECALL_REASONS } from './memory';
export type { Memory, MemoryKind, MemoryStatus, MemoryRecallReason } from './memory';

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
  /** v1.3：知识编译状态机（skipped/queued/running/ready/failed）+ 世代/时间/错误 */
  compileStatus?: 'skipped' | 'queued' | 'running' | 'ready' | 'failed';
  compiledAt?: string | null;
  compileError?: string | null;
  compileGeneration?: number;
}

export interface AppSettings extends EventSettingsFields, LocalModeSettingsFields {
  defaultChatModelId: string | null;
  defaultEmbeddingModelId: string | null;
  theme: Theme;
  /** v1.8 命名主题（缺省 stellar；与 theme 三态正交，stellar 时三态决定亮暗） */
  themeId?: ThemeId;
  language: Language;
  /** 是否已完成首次启动向导（v1.2 起；仅老用户由 v016 迁移回填为 true） */
  hasOnboarded: boolean;
  /** v1.3：混合检索（向量+FTS+规则重排）开关，缺省视为 true */
  hybridRetrievalEnabled?: boolean;
  /** v1.3：向量相似度软下限（0-1），缺省由 core 给 0.55 */
  retrievalMinSimilarity?: number;
  /** v1.3：RAG 注入片段上限，缺省由 core 给 8 */
  retrievalMaxChunks?: number;
  /** v1.3：编译优先检索路由（静态知识层前置），缺省视为 true */
  compileRoutingEnabled?: boolean;
  /** v1.3 M4：摄入后自动入队编译（缺省视为 true） */
  autoCompile?: boolean;
  /** v1.3 M4：编译 LLM 增强（缺省 false；规则通道零模型调用） */
  compileWithLlm?: boolean;
  /** v1.3 M4：编译增强所用对话模型（null=跟随默认对话模型） */
  compileModelId?: string | null;
  /** v1.6：情绪/关系内核总开关（缺省视为 true；与助手 expressionEnabled 同时为真才生效） */
  emotionEnabled?: boolean;
  /**
   * v2.0：关系等级养成开关（缺省视为 true）。
   * 关闭后等级演算/每日检查点/等级展示与解锁全部冻结；不影响 intimacy/trust 原始分。
   */
  relationshipEnabled?: boolean;
  /**
   * v1.6 M5：互动本地短句开关（缺省视为 true）。
   * 关闭后摸头/久别迎接不再说话（零文案气泡）；摸头表情与弹性等无音效动作反馈保留。
   */
  interactionLinesEnabled?: boolean;
  /** v2.2：勿扰时段开关（缺省视为 true，即 23:00–06:00 内不响应桌宠交互） */
  doNotDisturbEnabled?: boolean;
  /** v2.2：勿扰起始小时 0–23（含），缺省 23 */
  doNotDisturbStartHour?: number;
  /** v2.2：勿扰结束小时 0–23（不含），缺省 6 */
  doNotDisturbEndHour?: number;
  /**
   * v2.3：交互动画图的用户覆盖条目（缺省空 = 只用内置图）。
   * 覆盖条目排在内置图之前生效，内置图仍兜底，保证任何状态下都有可播动作。
   */
  interactionGraphOverrides?: InteractionGraphEntry[];
  /**
   * v2.3：被停用的内置动画图条目 id（缺省空 = 内置条目全部生效）。
   * 停用某触发键的全部条目后该交互不再有动作（「查不到返回空」）。
   */
  interactionGraphDisabledEntryIds?: string[];
  // v2.4 M1 演示模式开关与 T7 TTFV 里程碑经 LocalModeSettingsFields 交叉引入
  // （定义见 ./local-mode-settings）
  // v1.7 事件三字段经 EventSettingsFields 交叉引入（定义见 ../events/event-settings）
  /** v1.8 M3：上下文条数 2–50（缺省 DEFAULT_CONTEXT_MESSAGES=20；服务端钳制） */
  contextMessageCount?: number;
  /** v1.8 M3：全局追加提示词（角色卡之后、情绪段之前；空串=无） */
  globalAppendPrompt?: string;
  /** v1.8 M3：全局追加开关（内容为空时无效；缺省 false） */
  globalAppendPromptEnabled?: boolean;
  /** v1.8 M4：音色收藏（M3 冻结契约，M4 才有 UI） */
  voiceFavorites?: VoiceFavorite[];
}

/** v1.8 M4：音色收藏条目（形状随 settings 持久化） */
export interface VoiceFavorite {
  id: string;
  label: string;
  providerId: string;
  modelId: string;
  voice: string;
}

// ── v0.6 M3 本地技能包 ──
// 技能类型 v1.7 起拆至 ./skill（domain.ts 重新导出保持公开面不变）；
// MCP 领域类型（McpServerConfig/McpServerInfo/McpToolInfo）见 ./mcp。
export type {
  SkillPromptTemplate,
  SkillExample,
  SkillManifest,
  SkillDiskEntry,
  SkillState,
  SkillInfo,
} from './skill';
