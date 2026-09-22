// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { DocumentRecord, KnowledgeBase } from '@wbfm/shared';
import { renderWithProviders } from '@/test/render';
import { KnowledgePage } from './knowledge-page';

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

function doc(partial: Partial<DocumentRecord> & { id: string; status: DocumentRecord['status'] }): DocumentRecord {
  return {
    knowledgeBaseId: 'kb1',
    filename: 'notes.txt',
    fileType: '.txt',
    byteSize: 128,
    contentHash: 'hash',
    source: 'upload',
    sourceUrl: null,
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
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
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
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith('/api/documents/d2', expect.anything()),
    );
    expect(confirmSpy).toHaveBeenCalled();
    confirmSpy.mockRestore();
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
