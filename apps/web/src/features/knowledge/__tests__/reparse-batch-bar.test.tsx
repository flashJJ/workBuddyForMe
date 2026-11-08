// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { DocumentRecord } from '@wbfm/shared/types';
import type { DocumentReparseBatchStatus } from '@wbfm/core/services';
import { renderWithProviders } from '@/test/render';
import { ReparseBatchBar } from '../reparse/reparse-batch-bar';

const mocks = vi.hoisted(() => ({
  status: vi.fn(),
  mutateAsync: vi.fn(),
}));

vi.mock('@/lib/hooks/knowledge', () => ({
  useReparseBatchStatus: () => ({ data: mocks.status() }),
  useKnowledgeMutations: () => ({
    reparseBatch: { mutateAsync: mocks.mutateAsync, isPending: false },
  }),
}));

function doc(id: string, parseVersion: number): DocumentRecord {
  return {
    id,
    knowledgeBaseId: 'kb1',
    filename: `${id}.pdf`,
    fileType: '.pdf',
    byteSize: 10,
    contentHash: id,
    status: 'indexed',
    source: 'upload',
    sourceUrl: null,
    ocrStatus: null,
    ocrEngine: null,
    errorMessage: null,
    chunkCount: 1,
    parseVersion,
    createdAt: '2025-01-01T00:00:00.000Z',
    indexedAt: '2025-01-02T00:00:00.000Z',
  };
}

const status = (partial: Partial<DocumentReparseBatchStatus>): DocumentReparseBatchStatus => ({
  state: 'idle',
  knowledgeBaseId: null,
  total: 0,
  done: 0,
  failed: 0,
  skipped: 0,
  currentDocumentId: null,
  currentFilename: null,
  failures: [],
  startedAt: null,
  finishedAt: null,
  pauseRequested: false,
  cancelRequested: false,
  ...partial,
});

describe('ReparseBatchBar（v2.29 P1）', () => {
  beforeEach(() => {
    mocks.status.mockReturnValue(undefined);
    mocks.mutateAsync.mockReset().mockResolvedValue(status({}));
  });

  it('有待重建文档时显示数量并可启动', async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <ReparseBatchBar kbId="kb1" documents={[doc('d1', 0), doc('d2', 1)]} />,
    );
    expect(screen.getByTestId('reparse-batch-bar')).toHaveTextContent('1 篇文档待重建');
    await user.click(screen.getByTestId('reparse-batch-start'));
    expect(mocks.mutateAsync).toHaveBeenCalledWith({ kbId: 'kb1', action: 'start' });
  });

  it('运行中显示进度，暂停按钮发出 pause', async () => {
    mocks.status.mockReturnValue(
      status({
        state: 'running',
        knowledgeBaseId: 'kb1',
        total: 3,
        done: 1,
        currentFilename: 'b.pdf',
      }),
    );
    const user = userEvent.setup();
    renderWithProviders(<ReparseBatchBar kbId="kb1" documents={[doc('d1', 0)]} />);
    expect(screen.getByTestId('reparse-batch-progress')).toHaveTextContent('完成 1/3');
    await user.click(screen.getByTestId('reparse-batch-toggle'));
    expect(mocks.mutateAsync).toHaveBeenCalledWith({ kbId: 'kb1', action: 'pause' });
  });

  it('其他知识库运行中时提示稍后再试', () => {
    mocks.status.mockReturnValue(
      status({ state: 'running', knowledgeBaseId: 'kb2', total: 2 }),
    );
    renderWithProviders(<ReparseBatchBar kbId="kb1" documents={[doc('d1', 0)]} />);
    expect(screen.getByText(/另一个知识库正在重建/)).toBeTruthy();
    expect(screen.queryByTestId('reparse-batch-start')).toBeNull();
  });
});
