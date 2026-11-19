/**
 * v0.4 OCR 错误分类：
 * - OcrEngineUnavailableError：引擎不可用（未配置视觉模型 / tesseract 未安装或语言包下载失败）
 * - OcrFailedError：识别过程失败（上游报错且无兜底文本）
 * 摄入管线据此转换为文档 failed 状态与可读指引。
 */
export class OcrEngineUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'OcrEngineUnavailableError';
  }
}

export class OcrFailedError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'OcrFailedError';
  }
}

/** 扫描件无可用 OCR 结果时统一面向用户的指引文案 */
export const OCR_GUIDANCE_MESSAGE =
  '扫描件 OCR 失败，请尝试配置支持视觉的模型（如 qwen2.5-vl）或使用带文字层的 PDF';
