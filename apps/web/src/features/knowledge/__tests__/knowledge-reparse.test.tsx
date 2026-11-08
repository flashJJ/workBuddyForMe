// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import type { DocumentRecord, KnowledgeBase } from '@wbfm/shared/types';
import { renderWithProviders } from '@/test/render';
import { KnowledgePage } from '../knowledge-page';

vi.setConfig({ testTimeout: 20_000 });

const KB: KnowledgeBase = {
  id: 'kb1',
  name: '产品资料库',
  description: '产品文档',
  chunkSize: 500,
  chunkOverlap: 80,
  documentCount: 2,
  createdAt: '2025-01-01T00:00:00.000Z',
  updatedAt: '2025-01-01T00:00:00.000Z',
};

function doc(
  partial: Partial<DocumentRecord> & { id: string; status: DocumentRecord['status'] },
): DocumentRecord {
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
    parseVersion: 1,
    createdAt: '2025-01-01T00:00:00.000Z',
    indexedAt: null,
    ...partial,
  };
}

function ok(data: unknown): Response {
  return new Response(JSON.stringify({ success: true, data }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

describe('文档解析版本（v2.29 P0）', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
  });
  afterEach(() => vi.unstubAllGlobals());

  it('解析版本落后：列表显示待重建徽标与汇总', async () => {
    const legacy = doc({ id: 'd1', status: 'indexed', filename: 'old.pdf', parseVersion: 0 });
    const current = doc({ id: 'd2', status: 'indexed', filename: 'new.pdf', parseVersion: 1 });
    fetchMock.mockImplementation(async (url: string) => {
      if (url === '/api/knowledge-bases') return ok([KB]);
      if (url === '/api/knowledge-bases/kb1/documents') return ok([legacy, current]);
      return ok(null);
    });
    renderWithProviders(<KnowledgePage />);

    expect(await screen.findByTestId('reparse-summary')).toHaveTextContent('1 篇文档待重建');
    expect(screen.getAllByTestId('needs-reparse-badge')).toHaveLength(1);
  });
});
