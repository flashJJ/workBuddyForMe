/** 跨模块共享常量 */

export const PROVIDER_PROTOCOLS = ['openai-compatible', 'ollama'] as const;
export type ProviderProtocol = (typeof PROVIDER_PROTOCOLS)[number];

/** vision = 图片视觉理解（v0.3）；chat/embedding/vision 可叠加在同一模型上 */
export const MODEL_CAPABILITIES = ['chat', 'embedding', 'vision'] as const;
export type ModelCapability = (typeof MODEL_CAPABILITIES)[number];

export const MESSAGE_ROLES = ['system', 'user', 'assistant', 'tool'] as const;
export type MessageRole = (typeof MESSAGE_ROLES)[number];

export const MESSAGE_STATUSES = ['streaming', 'completed', 'error', 'stopped'] as const;
export type MessageStatus = (typeof MESSAGE_STATUSES)[number];

export const DOCUMENT_STATUSES = ['pending', 'processing', 'indexed', 'failed'] as const;
export type DocumentStatus = (typeof DOCUMENT_STATUSES)[number];

/** v0.3 文档来源：本地上传 / 网页剪藏 */
export const DOCUMENT_SOURCES = ['upload', 'webpage'] as const;
export type DocumentSource = (typeof DOCUMENT_SOURCES)[number];

export const THEMES = ['light', 'dark'] as const;
export type Theme = (typeof THEMES)[number];

/** 知识库默认分片参数 */
export const DEFAULT_CHUNK_SIZE = 500;
export const DEFAULT_CHUNK_OVERLAP = 80;
export const MIN_CHUNK_SIZE = 100;
export const MAX_CHUNK_SIZE = 4000;

/** RAG 默认检索条数 */
export const DEFAULT_TOP_K = 4;

/** v0.2 内置工具（全部只读）；助手通过 enabledTools 白名单授权 */
export const TOOL_NAMES = ['current_time', 'knowledge_search', 'fetch_webpage'] as const;
export type ToolName = (typeof TOOL_NAMES)[number];

/** 工具调用安全护栏常量 */
export const MAX_TOOL_ROUNDS = 5;
export const TOOL_TIMEOUT_MS = 15_000;

/** 上传限制 */
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
export const ALLOWED_DOC_EXTENSIONS = ['.txt', '.md', '.markdown', '.pdf'] as const;

/** v0.3 聊天图片附件限制 */
export const MAX_CHAT_ATTACHMENTS = 4;
export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
export const ALLOWED_IMAGE_MIME = ['image/png', 'image/jpeg', 'image/webp'] as const;
/** 浏览器侧压缩后最长边与 JPEG 质量（控制视觉 token） */
export const IMAGE_COMPRESS_MAX_EDGE = 1600;
export const IMAGE_COMPRESS_QUALITY = 0.85;

/** 外部请求默认超时（ms），SSE 不设短超时 */
export const DEFAULT_HTTP_TIMEOUT_MS = 30_000;
export const CONNECTION_TEST_TIMEOUT_MS = 10_000;
