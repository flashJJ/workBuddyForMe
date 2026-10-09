/** 跨模块共享枚举：协议、能力、消息/文档/OCR 状态、主题等 */

export const PROVIDER_PROTOCOLS = ['openai-compatible', 'ollama'] as const;
export type ProviderProtocol = (typeof PROVIDER_PROTOCOLS)[number];

/** vision = 图片视觉理解（v0.3）；chat/embedding/vision 可叠加在同一模型上 */
export const MODEL_CAPABILITIES = ['chat', 'embedding', 'vision'] as const;
export type ModelCapability = (typeof MODEL_CAPABILITIES)[number];

export const MESSAGE_ROLES = ['system', 'user', 'assistant', 'tool'] as const;
export type MessageRole = (typeof MESSAGE_ROLES)[number];

export const MESSAGE_STATUSES = ['streaming', 'completed', 'error', 'stopped'] as const;
export type MessageStatus = (typeof MESSAGE_STATUSES)[number];

/** v0.5 P1-2：助手消息用户反馈 */
export const MESSAGE_FEEDBACKS = ['up', 'down'] as const;
export type MessageFeedback = (typeof MESSAGE_FEEDBACKS)[number];

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

export const THEMES = ['light', 'dark', 'system'] as const;
export type Theme = (typeof THEMES)[number];

/** v1.2 国际化语言（核心路径双语；次要面板可回退） */
export const LANGUAGES = ['zh-CN', 'en-US'] as const;
export type Language = (typeof LANGUAGES)[number];
