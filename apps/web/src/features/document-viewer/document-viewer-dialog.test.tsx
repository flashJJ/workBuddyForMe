// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '@/test/render';
import { DocumentViewerDialog } from './document-viewer-dialog';

const STRUCTURE = {
  documentId: 'd1',
  parsedAt: '2026-11-02T00:00:00.000Z',
  structureAvailable: true,
  pages: [
    { pageNo: 1, blockIds: ['b1', 'b2'] },
    { pageNo: 2, blockIds: ['b3', 'b4'] },
  ],
  sections: [
    { path: ['合同'], blockIds: ['b1', 'b2'] },
    { path: ['合同', '付款条款'], blockIds: ['b3', 'b4'] },
  ],
  blocks: [
    {
      id: 'b1',
      kind: 'heading',
      pageNo: 1,
      sectionPath: ['合同'],
      content: '合同',
      charStart: 0,
      charEnd: 2,
    },
    {
      id: 'b2',
      kind: 'paragraph',
      pageNo: 1,
      sectionPath: ['合同'],
      content: '双方就采购事项达成一致。',
      charStart: 4,
      charEnd: 18,
    },
    {
      id: 'b3',
      kind: 'table',
      pageNo: 2,
      sectionPath: ['合同', '付款条款'],
      content: '| 阶段 | 比例 |\n| --- | --- |\n| 首付 | 30% |\n| 尾款 | 70% |',
      charStart: 20,
      charEnd: 80,
      table: {
        tableNo: 1,
        header: ['阶段', '比例'],
        rows: [
          ['首付', '30%'],
          ['尾款', '70%'],
        ],
        caption: '付款计划',
        pageNo: 2,
      },
    },
    {
      id: 'b4',
      kind: 'figure',
      pageNo: 2,
      sectionPath: ['合同', '付款条款'],
      content: '图 1 付款比例趋势',
      charStart: 82,
      charEnd: 96,
    },
  ],
  tables: [
    {
      tableNo: 1,
      header: ['阶段', '比例'],
      rows: [
        ['首付', '30%'],
        ['尾款', '70%'],
      ],
      caption: '付款计划',
      pageNo: 2,
      confidence: 0.55,
    },
  ],
  warnings: ['未检测到标题结构，章节路径为空'],
  visionAvailable: false,
};

function ok(data: unknown) {
  return new Response(JSON.stringify({ success: true, data }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

describe('DocumentViewerDialog（v2.19 M4）', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (url === '/api/documents/d1/structure') return ok(STRUCTURE);
      if (url === '/api/documents/d1/figure-summary' && init?.method === 'POST') {
        return ok({
          documentId: 'd1',
          blockId: 'b4',
          caption: '图 1 付款比例趋势',
          pageNo: 2,
          model: 'vision-test',
          summary: '图表显示首付 30%，尾款 70%。',
        });
      }
      return ok(null);
    });
    vi.stubGlobal('fetch', fetchMock);
  });
  afterEach(() => vi.unstubAllGlobals());

  it('引用定位：展开章节、高亮表格行/单元格并展示原文块', async () => {
    renderWithProviders(
      <DocumentViewerDialog
        documentId="d1"
        documentName="采购合同.pdf"
        open
        onOpenChange={() => undefined}
        focus={{
          sectionPath: ['合同', '付款条款'],
          tableNo: 1,
          tableRow: 2,
          tableCell: 'B3',
        }}
      />,
    );

    const dialog = await screen.findByTestId('document-structure-dialog');
    expect(await within(dialog).findByTestId('citation-focus')).toHaveTextContent(
      '合同 › 付款条款 · 表 1 · 第 2 行 · B3',
    );
    expect(within(dialog).getByTestId('structure-sections')).toHaveTextContent(/合同/);
    expect(within(dialog).getByTestId('structure-sections')).toHaveTextContent(/付款条款/);
    expect(within(dialog).getByTestId('structure-warnings')).toHaveTextContent(
      '未检测到标题结构',
    );
    expect(within(dialog).getByTestId('structure-blocks')).toHaveTextContent('尾款 | 70%');
    expect(within(dialog).getByTestId('structure-blocks')).toHaveTextContent('图 1 付款比例趋势');

    expect(within(dialog).getByTestId('table-confidence')).toHaveTextContent('置信度 55%');
    const targetedRow = within(dialog).getByTestId('table-row-1-2');
    expect(targetedRow).toHaveAttribute('data-targeted', 'true');
    const targetedCell = within(dialog).getByTestId('table-cell-B3');
    expect(targetedCell).toHaveTextContent('70%');
    expect(targetedCell).toHaveAttribute('data-cell', 'B3');
  });

  it('未配置视觉模型：图注可见但明确提示不可解读', async () => {
    renderWithProviders(
      <DocumentViewerDialog documentId="d1" documentName="采购合同.pdf" open onOpenChange={() => undefined} />,
    );
    const dialog = await screen.findByTestId('document-structure-dialog');
    const figures = await within(dialog).findByTestId('structure-figures');
    expect(figures).toHaveTextContent('图 1 付款比例趋势');
    expect(within(figures).getByTestId('figure-unavailable')).toHaveTextContent('未配置视觉模型');
    expect(within(figures).getByTestId('figure-interpret-b4')).toBeDisabled();
  });

  it('配置视觉模型后按需解读图注，展示模型与免责声明', async () => {
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url === '/api/documents/d1/structure') return ok({ ...STRUCTURE, visionAvailable: true });
      if (url === '/api/documents/d1/figure-summary' && init?.method === 'POST') {
        return ok({
          documentId: 'd1',
          blockId: 'b4',
          caption: '图 1 付款比例趋势',
          pageNo: 2,
          model: 'vision-test',
          summary: '图表显示首付 30%，尾款 70%。',
        });
      }
      return ok(null);
    });
    const user = userEvent.setup();
    renderWithProviders(
      <DocumentViewerDialog documentId="d1" documentName="采购合同.pdf" open onOpenChange={() => undefined} />,
    );
    const dialog = await screen.findByTestId('document-structure-dialog');
    await user.click(await within(dialog).findByTestId('figure-interpret-b4'));

    await waitFor(() => {
      const call = fetchMock.mock.calls.find(
        ([url]) => url === '/api/documents/d1/figure-summary',
      );
      expect(call).toBeDefined();
      expect(JSON.parse((call![1] as RequestInit).body as string)).toEqual({ blockId: 'b4' });
    });
    const summary = await within(dialog).findByTestId('figure-summary');
    expect(summary).toHaveTextContent('视觉模型解读 · vision-test');
    expect(summary).toHaveTextContent('图表显示首付 30%，尾款 70%。');
    expect(summary).toHaveTextContent('由视觉模型生成，可能存在误差');
  });
});
