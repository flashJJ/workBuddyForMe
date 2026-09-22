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

/** v0.4：partial = OCR 部分成功（超时/超页只识别了部分页面，文本可检索但不完整） */
export const DOCUMENT_STATUSES = ['pending', 'processing', 'indexed', 'failed', 'partial'] as const;
export type DocumentStatus = (typeof DOCUMENT_STATUSES)[number];

/** v0.4 OCR 状态：null=非扫描件未走 OCR；running=识别中；done=完成；failed=失败；skipped=检测为扫描件但无可用引擎 */
export const OCR_STATUSES = ['running', 'done', 'failed', 'skipped'] as const;
export type OcrStatus = (typeof OCR_STATUSES)[number];

/** v0.4 OCR 引擎：vision=视觉模型逐页识别；tesseract=WASM 离线兜底 */
export const OCR_ENGINES = ['vision', 'tesseract'] as const;
export type OcrEngine = (typeof OCR_ENGINES)[number];

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
export const ALLOWED_DOC_EXTENSIONS = [
  '.txt',
  '.md',
  '.markdown',
  '.pdf',
  '.docx',
  '.xlsx',
  '.pptx',
] as const;

/** v0.3 聊天图片附件限制 */
export const MAX_CHAT_ATTACHMENTS = 4;
export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
export const ALLOWED_IMAGE_MIME = ['image/png', 'image/jpeg', 'image/webp'] as const;
/** 浏览器侧压缩后最长边与 JPEG 质量（控制视觉 token） */
export const IMAGE_COMPRESS_MAX_EDGE = 1600;
export const IMAGE_COMPRESS_QUALITY = 0.85;

/** v0.4 图片型 PDF OCR 参数 */
/** 文字层密度阈值：平均每页字符数低于此值判定为扫描件 */
export const OCR_TEXT_DENSITY_THRESHOLD = 50;
/** 单页 OCR 超时（ms），超时跳过该页 */
export const OCR_PAGE_TIMEOUT_MS = 30_000;
/** 全文 OCR 总超时（ms），超时保留已识别页并标记 partial */
export const OCR_TOTAL_TIMEOUT_MS = 5 * 60_000;
/** OCR 处理页数软上限，超出部分不处理并标记 partial */
export const OCR_MAX_PAGES = 50;
/**
 * PDF 渲染缩放：
 * - 视觉 2x（A4 ≈1190×1684，约 144DPI）；
 * - tesseract 3x（≈288DPI 保识别率）。
 */
export const OCR_VISION_SCALE = 2;
export const OCR_TESSERACT_SCALE = 3;
/**
 * 送视觉模型的单页像素上限：约 2M 像素。
 * 视觉模型按像素计 image token（qwen2.5-vl 约 784px/token，此预算 ≈2550 token），
 * 限制总量可避免本地模型默认 4096 上下文（如 Ollama）直接返回 400；
 * 对超大画幅/非标准 MediaBox 的扫描件按比例缩回，标准 A4 在 2x 下不受影响。
 */
export const OCR_VISION_MAX_PIXELS = 2_000_000;

/** 外部请求默认超时（ms），SSE 不设短超时 */
export const DEFAULT_HTTP_TIMEOUT_MS = 30_000;
export const CONNECTION_TEST_TIMEOUT_MS = 10_000;

/**
 * 聊天流式请求的连接建立超时（响应头到达前）：
 * 本地大模型冷加载（如 qwen2.5-vl 7B 约 6GB 装载）首字节可能超 60s，
 * 仅在响应头迟迟不到时才触发；连不上/DNS 失败仍会立即报错。
 */
export const CHAT_CONNECT_TIMEOUT_MS = 180_000;
