/** 上传/OCR 域：文档与图片附件限制、图片型 PDF OCR 参数 */

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
