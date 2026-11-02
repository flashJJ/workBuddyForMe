// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ContentPackSummary, DocumentRecord, KnowledgeBase } from '@wbfm/shared/types';
import { renderWithProviders } from '@/test/render';
import { KnowledgePage } from './knowledge-page';

// Windows CI 冷启动下知识库页面首个操作可能超过默认 5s，统一给本文件 20s 预算
vi.setConfig({ testTimeout: 20_000 });

const KB: KnowledgeBase = {
  id: 'kb1',
  name: '产品资料库',
  description: '产品文档',
  chunkSize: 500,
  chunkOverlap: 80,
  documentCount: 1,
  createdAt: '2025-01-01T00:00:00.000Z',
  updatedAt: '2025-01-01T00:00:00.000Z',
};

const CONTENT_PACK: ContentPackSummary = {
  id: 'how-to-live-better',
  name: '高性价比人生指南',
  description: '767 条循证生活建议。',
  sourceUrl: 'https://github.com/eternity4719/HowToLiveBetter',
  license: 'CC BY 4.0',
  licenseUrl: 'https://creativecommons.org/licenses/by/4.0/',
  version: 'e2605d3',
  publishedAt: '2026-10-21',
  fileCount: 34,
  totalBytes: 2385074,
  sha256: '7095f7cb286a8ef634750251ef47db7c8de98ce4d5b22a36878ceab619ffff46',
  disclaimer: '仅按书检索与引用。',
  imported: false,
  documentCount: 0,
};

function doc(partial: Partial<DocumentRecord> & { id: string; status: DocumentRecord['status'] }): DocumentRecord {
  return {
    knowledgeBaseId: 'kb1',
    filename: 'notes.txt',
    fileType: '.txt',
    byteSize: 128,
    contentHash: 'hash',
    source: 'upload',
    sourceUrl: null,
    ocrStatus: null,
    ocrEngine: null,
    errorMessage: null,
    chunkCount: 0,
    createdAt: '2025-01-01T00:00:00.000Z',
    indexedAt: null,
    ...partial,
  };
}

function ok(data: unknown, status = 200) {
  return new Response(JSON.stringify({ success: true, data }), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

describe('知识库页面（TR-28.1）', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
  });
  afterEach(() => vi.unstubAllGlobals());

  it('新建知识库：默认分片参数随表单提交，列表刷新', async () => {
    let list: KnowledgeBase[] = [];
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url === '/api/knowledge-bases' && init?.method === 'POST') {
        list = [KB];
        return ok(KB);
      }
      if (url === '/api/knowledge-bases') return ok(list);
      return ok([]);
    });
    const user = userEvent.setup();
    renderWithProviders(<KnowledgePage />);

    await user.click(await screen.findByRole('button', { name: '+ 新建知识库' }));
    await user.type(screen.getByLabelText('名称'), '产品资料库');
    await user.click(screen.getByRole('button', { name: '保存' }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith('/api/knowledge-bases', expect.anything()),
    );
    const postCall = fetchMock.mock.calls.find(
      (call) => call[0] === '/api/knowledge-bases' && (call[1] as RequestInit).method === 'POST',
    );
    expect(JSON.parse((postCall![1] as RequestInit).body as string)).toMatchObject({
      name: '产品资料库',
      chunkSize: 500,
      chunkOverlap: 80,
    });
    expect(await screen.findAllByText('产品资料库')).not.toHaveLength(0);
  });

  it('拖拽上传：multipart 携带 file 字段；文档由等待中轮询到已索引', async () => {
    let documentStatus: DocumentRecord['status'] = 'pending';
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url === '/api/knowledge-bases') return ok([KB]);
      if (url === '/api/knowledge-bases/kb1/documents' && init?.method === 'POST') {
        documentStatus = 'processing';
        return ok(doc({ id: 'd1', status: 'processing' }));
      }
      if (url === '/api/knowledge-bases/kb1/documents') {
        documentStatus = documentStatus === 'processing' ? 'indexed' : documentStatus;
        return ok([
          doc({
            id: 'd1',
            status: documentStatus,
            chunkCount: documentStatus === 'indexed' ? 3 : 0,
            indexedAt: documentStatus === 'indexed' ? '2025-01-02T00:00:00.000Z' : null,
          }),
        ]);
      }
      return ok(null);
    });

    const { container } = renderWithProviders(<KnowledgePage />);
    const dropzone = await screen.findByTestId('upload-dropzone');

    const file = new File(['hello knowledge'], 'guide.txt', { type: 'text/plain' });
    fireEvent.drop(dropzone, { dataTransfer: { files: [file] } });

    await waitFor(() => {
      const postCall = fetchMock.mock.calls.find(
        (call) =>
          String(call[0]) === '/api/knowledge-bases/kb1/documents' &&
          (call[1] as RequestInit).method === 'POST',
      );
      expect(postCall).toBeDefined();
      const form = (postCall![1] as RequestInit).body as FormData;
      expect(form.get('file')).toBeInstanceOf(File);
    });

    expect(await screen.findByText('已索引')).toBeInTheDocument();
    expect(container.textContent).toContain('3 个分片');
  });

  it('失败文档展示错误 tooltip，确认后删除并调用 DELETE', async () => {
    const failed = doc({ id: 'd2', filename: 'bad.pdf', status: 'failed', errorMessage: 'PDF 解析失败' });
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url === '/api/knowledge-bases') return ok([KB]);
      if (url === '/api/knowledge-bases/kb1/documents') return ok([failed]);
      if (url === '/api/documents/d2' && init?.method === 'DELETE') return ok({ id: 'd2' });
      return ok(null);
    });
    const user = userEvent.setup();
    renderWithProviders(<KnowledgePage />);

    const badge = await screen.findByText('失败');
    expect(badge).toHaveAttribute('title', 'PDF 解析失败');

    await user.click(screen.getByRole('button', { name: '删除文档 bad.pdf' }));
    // v1.2：window.confirm 已替换为应用内 ConfirmDialog
    const dialog = await screen.findByRole('dialog');
    expect(dialog).toHaveTextContent('删除文档');
    await user.click(within(dialog).getByRole('button', { name: '删除' }));
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith('/api/documents/d2', expect.anything()),
    );
  });

  it('M4 内容包：展示来源/许可/体积，确认后 POST 导入并按 id 调用', async () => {
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url === '/api/knowledge-bases') return ok([]);
      if (url === '/api/content-packs') return ok([CONTENT_PACK]);
      if (url === '/api/content-packs/import' && init?.method === 'POST') {
        return ok({
          packId: CONTENT_PACK.id,
          knowledgeBase: KB,
          importedDocuments: 35,
          sha256: CONTENT_PACK.sha256,
        }, 201);
      }
      return ok(null);
    });
    const user = userEvent.setup();
    renderWithProviders(<KnowledgePage />);

    const card = await screen.findByTestId('content-pack-how-to-live-better');
    expect(card).toHaveTextContent('CC BY 4.0');
    expect(card).toHaveTextContent('34 篇');
    expect(card).toHaveTextContent('2.3 MB');

    await user.click(screen.getByTestId('content-pack-import-how-to-live-better'));
    const dialog = await screen.findByRole('dialog');
    expect(dialog).toHaveTextContent('SHA-256');
    await user.click(within(dialog).getByRole('button', { name: '导入内容包' }));

    await waitFor(() => {
      const call = fetchMock.mock.calls.find(
        (item) => item[0] === '/api/content-packs/import',
      );
      expect(call).toBeDefined();
      expect(JSON.parse((call![1] as RequestInit).body as string)).toEqual({
        id: 'how-to-live-better',
      });
    });
    expect(await screen.findByText(/正在后台索引/)).toBeInTheDocument();
  });

  it('M3 网页剪藏：网页文档带标识与原文链接；弹窗提交 URL 调 /clip', async () => {
    const page = doc({
      id: 'w1',
      status: 'indexed',
      filename: '本地知识库实践指南.md',
      source: 'webpage',
      sourceUrl: 'https://example.com/article',
      chunkCount: 2,
      indexedAt: '2025-01-02T00:00:00.000Z',
    });
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url === '/api/knowledge-bases') return ok([KB]);
      if (url === '/api/knowledge-bases/kb1/documents') return ok([page]);
      if (url === '/api/knowledge-bases/kb1/clip' && init?.method === 'POST') {
        return ok(doc({ id: 'w2', status: 'pending', filename: '新文章.md', source: 'webpage' }));
      }
      return ok(null);
    });
    const user = userEvent.setup();
    renderWithProviders(<KnowledgePage />);

    expect(await screen.findByTestId('webpage-badge')).toHaveTextContent('网页');
    expect(screen.getByTestId('webpage-source-link')).toHaveAttribute(
      'href',
      'https://example.com/article',
    );

    await user.click(screen.getByRole('button', { name: '从网页导入' }));
    await user.type(screen.getByTestId('clip-url-input'), 'https://example.com/post');
    await user.click(screen.getByTestId('clip-submit'));

    await waitFor(() => {
      const call = fetchMock.mock.calls.find(
        (c) => String(c[0]) === '/api/knowledge-bases/kb1/clip',
      );
      expect(call).toBeDefined();
      expect(JSON.parse((call![1] as RequestInit).body as string)).toEqual({
        url: 'https://example.com/post',
      });
    });
  });
});
