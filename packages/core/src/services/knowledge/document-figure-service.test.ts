import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { StoredDocumentBlock } from '@wbfm/database';
import type { DocumentRecord } from '@wbfm/shared/types';
import { ApiError } from '@wbfm/shared/errors';
import type { ResolvedVisionTarget } from '../../ingestion/vision-target';
import {
  summarizeDocumentFigure,
  visionUnavailableReason,
} from './document-figure-service';

const resolveVisionTarget = vi.hoisted(() => vi.fn());
const renderPdfPagesToPng = vi.hoisted(() => vi.fn());

vi.mock('../../ingestion/vision-target', () => ({ resolveVisionTarget }));
vi.mock('../../ingestion/pdf-render', () => ({ renderPdfPagesToPng }));

const DOCUMENT: DocumentRecord = {
  id: 'd1',
  knowledgeBaseId: 'kb1',
  filename: 'report.pdf',
  fileType: '.pdf',
  byteSize: 1,
  contentHash: 'h1',
  status: 'indexed',
  source: 'upload',
  sourceUrl: null,
  ocrStatus: null,
  ocrEngine: null,
  errorMessage: null,
  chunkCount: 1,
  createdAt: '2025-01-01T00:00:00.000Z',
  indexedAt: '2025-01-02T00:00:00.000Z',
};

function block(ordinal: number, kind: StoredDocumentBlock['kind'], pageNo: number | null): StoredDocumentBlock {
  return {
    id: ordinal + 1,
    documentId: 'd1',
    ordinal,
    kind,
    pageNo,
    sectionPath: ['报告'],
    content: '图 1 季度营收趋势',
    charStart: 0,
    charEnd: 10,
  };
}

const BLOCKS = [block(0, 'heading', 1), block(2, 'figure', 2)];
const SOURCE = new Uint8Array([1, 2, 3]);

function targetWith(summary: string): ResolvedVisionTarget {
  return {
    provider: {
      chatStream: () =>
        (async function* () {
          yield { delta: summary };
        })(),
    } as unknown as ResolvedVisionTarget['provider'],
    model: { modelId: 'vision-test' } as ResolvedVisionTarget['model'],
  };
}

function deps() {
  return {} as Parameters<typeof summarizeDocumentFigure>[0]['deps'];
}

describe('document-figure-service（v2.19 M4）', () => {
  beforeEach(() => {
    resolveVisionTarget.mockReset();
    renderPdfPagesToPng.mockReset();
  });

  it('未配置视觉模型：明确拒绝并可读原因', async () => {
    resolveVisionTarget.mockReturnValue(null);
    const promise = summarizeDocumentFigure({
      deps: deps(),
      document: DOCUMENT,
      blocks: BLOCKS,
      blockId: 'b3',
      source: SOURCE,
    });
    await expect(promise).rejects.toThrow(visionUnavailableReason());
  });

  it('非 PDF / 无原始文件 / 缺页码分别给出可读原因', async () => {
    resolveVisionTarget.mockReturnValue(targetWith('x'));
    await expect(
      summarizeDocumentFigure({
        deps: deps(),
        document: { ...DOCUMENT, filename: 'report.md', fileType: '.md' },
        blocks: BLOCKS,
        blockId: 'b3',
        source: SOURCE,
      }),
    ).rejects.toThrow(/仅支持 PDF/);
    await expect(
      summarizeDocumentFigure({
        deps: deps(),
        document: DOCUMENT,
        blocks: BLOCKS,
        blockId: 'b3',
        source: null,
      }),
    ).rejects.toThrow(/原始文件未保留/);
    await expect(
      summarizeDocumentFigure({
        deps: deps(),
        document: DOCUMENT,
        blocks: BLOCKS.map((item) => ({ ...item, pageNo: null })),
        blockId: 'b3',
        source: SOURCE,
      }),
    ).rejects.toThrow(/缺少页码/);
  });

  it('非图注块与非法块 id 拒绝', async () => {
    resolveVisionTarget.mockReturnValue(targetWith('x'));
    await expect(
      summarizeDocumentFigure({
        deps: deps(),
        document: DOCUMENT,
        blocks: BLOCKS,
        blockId: 'b1',
        source: SOURCE,
      }),
    ).rejects.toThrow(/不是图注/);
    await expect(
      summarizeDocumentFigure({
        deps: deps(),
        document: DOCUMENT,
        blocks: BLOCKS,
        blockId: 'x3',
        source: SOURCE,
      }),
    ).rejects.toThrow(/非法的结构块 id/);
  });

  it('成功：渲染页码、清理代码围栏并返回模型名', async () => {
    resolveVisionTarget.mockReturnValue(
      targetWith('```text\n图 1 显示营收逐季上升，Q4 达到峰值。\n```'),
    );
    renderPdfPagesToPng.mockResolvedValue([{ pageNumber: 2, png: Buffer.from('png') }]);
    const result = await summarizeDocumentFigure({
      deps: deps(),
      document: DOCUMENT,
      blocks: BLOCKS,
      blockId: 'b3',
      source: SOURCE,
    });
    expect(renderPdfPagesToPng).toHaveBeenCalledWith(SOURCE, [2], 2, 1_200_000);
    expect(result).toMatchObject({
      documentId: 'd1',
      blockId: 'b3',
      caption: '图 1 季度营收趋势',
      pageNo: 2,
      model: 'vision-test',
      summary: '图 1 显示营收逐季上升，Q4 达到峰值。',
    });
  });

  it('空描述视为失败，不返回空白摘要', async () => {
    resolveVisionTarget.mockReturnValue(targetWith('   '));
    renderPdfPagesToPng.mockResolvedValue([{ pageNumber: 2, png: Buffer.from('png') }]);
    await expect(
      summarizeDocumentFigure({
        deps: deps(),
        document: DOCUMENT,
        blocks: BLOCKS,
        blockId: 'b3',
        source: SOURCE,
      }),
    ).rejects.toThrow(ApiError);
  });
});
