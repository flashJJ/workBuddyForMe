// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { DocumentRecord } from '@wbfm/shared/types';
import { renderWithProviders } from '@/test/render';
import { CompileToolbar } from './compile-toolbar';

const mocks = vi.hoisted(() => ({
  reparseDocument: vi.fn(async () => ({ queued: true as const })),
}));

vi.mock('@/lib/hooks/knowledge', () => ({
  useCompileStatus: () => ({ data: { counts: { running: 0, queued: 0 }, progress: null } }),
  useCompileEvents: () => undefined,
  useKnowledgeMutations: () => ({
    reparseDocument: { mutateAsync: mocks.reparseDocument },
    compile: { mutateAsync: vi.fn() },
    compileCancel: { mutateAsync: vi.fn() },
  }),
}));

function doc(partial: Partial<DocumentRecord> & { id: string; status: DocumentRecord['status'] }): DocumentRecord {
  return {
    knowledgeBaseId: 'kb1',
    filename: 'bad.pdf',
    fileType: '.pdf',
    byteSize: 128,
    contentHash: 'hash',
    source: 'upload',
    sourceUrl: null,
    ocrStatus: null,
    ocrEngine: null,
    errorMessage: '未配置可用的 embedding 模型',
    chunkCount: 0,
    parseVersion: 1,
    createdAt: '2025-01-01T00:00:00.000Z',
    indexedAt: null,
    ...partial,
  };
}

describe('编译工具栏重试失败（v2.20 补丁）', () => {
  beforeEach(() => mocks.reparseDocument.mockClear());

  it('仅存在索引失败文档时显示重试按钮，点击逐个走 reparse', async () => {
    const user = userEvent.setup();
    renderWithProviders(<CompileToolbar kbId="kb1" documents={[doc({ id: 'd2', status: 'failed' })]} />);

    const retry = screen.getByTestId('compile-retry-failed');
    expect(retry).toHaveTextContent('重试失败（1）');

    await user.click(retry);
    await waitFor(() =>
      expect(mocks.reparseDocument).toHaveBeenCalledWith({ kbId: 'kb1', documentId: 'd2' }),
    );
  });

  it('没有失败文档时不显示重试按钮', () => {
    renderWithProviders(<CompileToolbar kbId="kb1" documents={[doc({ id: 'd1', status: 'indexed', chunkCount: 3 })]} />);
    expect(screen.queryByTestId('compile-retry-failed')).toBeNull();
  });
});
