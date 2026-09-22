import type { ChatContentPart } from '@wbfm/ai';
import type { ResolvedVisionTarget } from './vision-target';

/**
 * 视觉模型 OCR（v0.4 优先引擎）：PDF 页位图 → data URL → 视觉模型逐字识别。
 * 复用对话供应商通道（Ollama qwen2.5-vl 等），无额外本地依赖。
 */

const OCR_SYSTEM_PROMPT =
  '你是一个 OCR 文字识别引擎。请识别用户提供的文档页面扫描图片中的全部文字。';

const OCR_USER_PROMPT =
  '请逐字识别图片中的文字内容，保持原有段落、换行与阅读顺序。' +
  '只输出识别到的纯文本，不要解释、不要前后缀、不要使用 Markdown 代码块包裹。';

/** 去除模型偶发包裹的 ```代码块围栏与「识别结果：」之类前缀 */
function normalizeOcrOutput(raw: string): string {
  let text = raw.trim();
  const fenceMatch = text.match(/^```[a-zA-Z]*\s*([\s\S]*?)\s*```$/);
  if (fenceMatch && fenceMatch[1] !== undefined) text = fenceMatch[1].trim();
  return text;
}

/** 对单页 PNG 执行视觉 OCR；signal 由调用方控制单页超时 */
export async function recognizePageWithVision(
  target: ResolvedVisionTarget,
  png: Buffer,
  signal?: AbortSignal,
): Promise<string> {
  const dataUrl = `data:image/png;base64,${png.toString('base64')}`;
  const content: ChatContentPart[] = [
    { type: 'text', text: OCR_USER_PROMPT },
    { type: 'image_url', image_url: { url: dataUrl, detail: 'auto' } },
  ];

  const stream = target.provider.chatStream({
    model: target.model.modelId,
    // OCR 是确定性转录任务：关闭采样，降低漏行/串行的随机性
    temperature: 0,
    messages: [
      { role: 'system', content: OCR_SYSTEM_PROMPT },
      { role: 'user', content },
    ],
    signal,
  });

  let raw = '';
  for await (const chunk of stream) {
    raw += chunk.delta;
  }
  return normalizeOcrOutput(raw);
}
