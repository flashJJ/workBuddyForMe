/** 跨模块共享常量 */

export const PROVIDER_PROTOCOLS = ['openai-compatible', 'ollama'] as const;
export type ProviderProtocol = (typeof PROVIDER_PROTOCOLS)[number];

export const MODEL_CAPABILITIES = ['chat', 'embedding'] as const;
export type ModelCapability = (typeof MODEL_CAPABILITIES)[number];

export const MESSAGE_ROLES = ['system', 'user', 'assistant', 'tool'] as const;
export type MessageRole = (typeof MESSAGE_ROLES)[number];

export const MESSAGE_STATUSES = ['streaming', 'completed', 'error', 'stopped'] as const;
export type MessageStatus = (typeof MESSAGE_STATUSES)[number];

export const DOCUMENT_STATUSES = ['pending', 'processing', 'indexed', 'failed'] as const;
export type DocumentStatus = (typeof DOCUMENT_STATUSES)[number];

export const THEMES = ['light', 'dark'] as const;
export type Theme = (typeof THEMES)[number];

/** 知识库默认分片参数 */
export const DEFAULT_CHUNK_SIZE = 500;
export const DEFAULT_CHUNK_OVERLAP = 80;
export const MIN_CHUNK_SIZE = 100;
export const MAX_CHUNK_SIZE = 4000;

/** RAG 默认检索条数 */
export const DEFAULT_TOP_K = 4;

/** 上传限制 */
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
export const ALLOWED_DOC_EXTENSIONS = ['.txt', '.md', '.markdown', '.pdf'] as const;

/** 外部请求默认超时（ms），SSE 不设短超时 */
export const DEFAULT_HTTP_TIMEOUT_MS = 30_000;
export const CONNECTION_TEST_TIMEOUT_MS = 10_000;
