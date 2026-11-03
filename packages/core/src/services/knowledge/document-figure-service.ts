import type { ChatContentPart } from '@wbfm/ai';
import { ApiError } from '@wbfm/shared/errors';
import type { DocumentRecord } from '@wbfm/shared/types';
import type { StoredDocumentBlock } from '@wbfm/database';
import { renderPdfPagesToPng } from '../../ingestion/pdf-render';
import { resolveVisionTarget } from '../../ingestion/vision-target';
import type { ServiceDeps } from '../base/deps';

/** v2.19 M4：按需用视觉模型解读 PDF 页面里的图表/图片（不落库、不阻塞文本链路） */

const FIGURE_TIMEOUT_MS = 60_000;
const FIGURE_MAX_PIXELS = 1_200_000;
const FIGURE_SUMMARY_MAX = 600;

const FIGURE_SYSTEM_PROMPT =
  '你是文档图表与图片理解助手。只描述图片中可见的信息，不推测作者意图，不编造数值。';

function figurePrompt(filename: string, pageNo: number, caption: string): string {
  const captionLine = caption.trim() ? `图注：${caption.trim()}。` : '';
  return [
    `这是文档《${filename}》第 ${pageNo} 页的页面截图。${captionLine}`,
    '请定位页面中的图表、流程图或图片，说明其类型、标题、坐标轴/图例、主要趋势与可辨认的关键数值。',
    '用中文回答，控制在 200 字以内；看不清的部分请明确说无法确认。',
  ].join('\n');
}

function cleanSummary(raw: string): string {
  let text = raw.trim();
  const fence = text.match(/^```[a-zA-Z]*\s*([\s\S]*?)\s*```$/);
  if (fence && fence[1] !== undefined) text = fence[1].trim();
  return text.slice(0, FIGURE_SUMMARY_MAX);
}

export interface FigureSummary {
  documentId: string;
  blockId: string;
  caption: string;
  pageNo: number;
  model: string;
  summary: string;
}

export interface FigureSummaryInput {
  deps: ServiceDeps;
  document: DocumentRecord;
  blocks: readonly StoredDocumentBlock[];
  /** 结构视图块 id（b1 起，对应 DB ordinal 0 起） */
  blockId: string;
  source: Uint8Array | null;
  signal?: AbortSignal;
}

/** 结构视图块 id → DB 块（序号 b1 = ordinal 0） */
export function findFigureBlock(
  blocks: readonly StoredDocumentBlock[],
  blockId: string,
): StoredDocumentBlock {
  const match = /^b([1-9]\d*)$/.exec(blockId.trim());
  if (!match) throw ApiError.validation(`非法的结构块 id：${blockId}`);
  const block = blocks.find((item) => item.ordinal === Number(match[1]) - 1);
  if (!block) throw ApiError.notFound('结构块', blockId);
  if (block.kind !== 'figure') throw ApiError.validation('该结构块不是图注/图表，无法用视觉模型解读');
  return block;
}

/** 未配置视觉模型时的可读原因（结构面板直接提示，不发起模型请求） */
export function visionUnavailableReason(): string {
  return '未配置视觉模型：请在设置中选择支持图片理解（vision）的模型后再试';
}

/** 按需解读图注所在 PDF 页面；失败给出明确原因，不修改文档与索引 */
export async function summarizeDocumentFigure(input: FigureSummaryInput): Promise<FigureSummary> {
  const block = findFigureBlock(input.blocks, input.blockId);
  const target = resolveVisionTarget(input.deps);
  if (!target) throw ApiError.validation(visionUnavailableReason());

  const isPdf =
    input.document.fileType.toLowerCase() === '.pdf' ||
    input.document.filename.toLowerCase().endsWith('.pdf');
  if (!isPdf) {
    throw ApiError.validation('图表/图片理解仅支持 PDF 页面；该文档没有可渲染的页面图像');
  }
  if (!input.source) {
    throw ApiError.validation('原始文件未保留，无法渲染页面；请重新上传该文档后再试');
  }
  if (block.pageNo === null) {
    throw ApiError.validation('该图注缺少页码，无法定位页面图像');
  }

  let png: Buffer;
  try {
    const [rendered] = await renderPdfPagesToPng(
      input.source,
      [block.pageNo],
      2,
      FIGURE_MAX_PIXELS,
    );
    if (!rendered) throw new Error('页面渲染结果为空');
    png = rendered.png;
  } catch (error) {
    throw ApiError.validation(
      `页面渲染失败：${error instanceof Error ? error.message : String(error)}`,
    );
  }

  const timeout = AbortSignal.timeout(FIGURE_TIMEOUT_MS);
  const signal = input.signal ? AbortSignal.any([input.signal, timeout]) : timeout;
  const content: ChatContentPart[] = [
    { type: 'text', text: figurePrompt(input.document.filename, block.pageNo, block.content) },
    {
      type: 'image_url',
      image_url: { url: `data:image/png;base64,${png.toString('base64')}`, detail: 'auto' },
    },
  ];

  let raw = '';
  try {
    const stream = target.provider.chatStream({
      model: target.model.modelId,
      temperature: 0,
      messages: [
        { role: 'system', content: FIGURE_SYSTEM_PROMPT },
        { role: 'user', content },
      ],
      signal,
    });
    for await (const chunk of stream) raw += chunk.delta;
  } catch (error) {
    throw ApiError.validation(
      `视觉模型调用失败：${error instanceof Error ? error.message : String(error)}`,
    );
  }

  const summary = cleanSummary(raw);
  if (!summary) throw ApiError.validation('视觉模型未返回可用描述');
  return {
    documentId: input.document.id,
    blockId: input.blockId,
    caption: block.content,
    pageNo: block.pageNo,
    model: target.model.modelId,
    summary,
  };
}
