// @vitest-environment jsdom
import * as React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '@/test/render';
import { BranchPanel } from './branch-panel';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

function ok(data: unknown, status = 200) {
  return new Response(JSON.stringify({ success: true, data }), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

describe('v2.21 分支面板', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
  });

  it('展示预算与空态；提交后调用派生接口', async () => {
    fetchMock.mockResolvedValue(
      ok({
        branches: [],
        budget: {
          rootConversationId: 'c1',
          usedTokens: 1200,
          reservedTokens: 0,
          limitTokens: 200000,
          activeCount: 0,
        },
      }),
    );

    renderWithProviders(<BranchPanel conversationId="c1" />);
    expect(await screen.findByText('还没有派生分支。')).toBeInTheDocument();
    expect(screen.getByTestId('branch-budget')).toHaveTextContent('已用 1200');

    await userEvent.click(screen.getByTestId('branch-create-open'));
    await userEvent.type(screen.getByTestId('branch-goal-input'), '整理竞品');
    fetchMock.mockResolvedValueOnce(
      ok(
        {
          branch: {
            id: 'b1',
            parentConversationId: 'c1',
            childConversationId: 'c2',
            rootConversationId: 'c1',
            title: '整理竞品',
            goal: '整理竞品',
            status: 'queued',
            statusReason: null,
            evidence: null,
            reservedTokens: 0,
            depth: 1,
            archivedAt: null,
            createdAt: '2026-11-04T00:00:00.000Z',
            updatedAt: '2026-11-04T00:00:00.000Z',
            endedAt: null,
          },
          childConversationId: 'c2',
        },
        201,
      ),
    );

    await userEvent.click(screen.getByTestId('branch-create-submit'));
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining('/api/conversations/c1/branches'),
        expect.objectContaining({ method: 'POST' }),
      ),
    );
  });

  it('终态分支可重试；空回传显示无运行结果', async () => {
    const branch = {
      id: 'b1',
      parentConversationId: 'c1',
      childConversationId: 'c2',
      rootConversationId: 'c1',
      title: '已取消分支',
      goal: '整理竞品',
      status: 'cancelled',
      statusReason: '分支已取消',
      reservedTokens: 0,
      depth: 1,
      archivedAt: null,
      createdAt: '2026-11-04T00:00:00.000Z',
      updatedAt: '2026-11-04T00:00:00.000Z',
      endedAt: '2026-11-04T00:01:00.000Z',
      evidence: {
        branchId: 'b1',
        parentConversationId: 'c1',
        childConversationId: 'c2',
        rootConversationId: 'c1',
        status: 'cancelled',
        summary: '',
        artifacts: [],
        usage: null,
        needsReview: true,
        createdAt: '2026-11-04T00:01:00.000Z',
      },
    };
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes('/retry')) {
        return ok(
          { branch: { ...branch, id: 'b2' }, childConversationId: 'c3', retriedFrom: 'b1' },
          201,
        );
      }
      return ok({
        branches: [branch],
        budget: {
          rootConversationId: 'c1',
          usedTokens: 0,
          reservedTokens: 0,
          limitTokens: 200000,
          activeCount: 0,
        },
      });
    });

    renderWithProviders(<BranchPanel conversationId="c1" />);
    const card = await screen.findByTestId('branch-card-b1');
    expect(within(card).getByText(/无运行结果/)).toBeInTheDocument();
    await userEvent.click(within(card).getByRole('button', { name: '重试' }));
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining('/api/branches/b1/retry'),
        expect.objectContaining({ method: 'POST' }),
      ),
    );
  });

  it('启动被并发/预算拒绝时展示接口原因，不静默失败', async () => {
    const branch = {
      id: 'b1',
      parentConversationId: 'c1',
      childConversationId: 'c2',
      rootConversationId: 'c1',
      title: '排队分支',
      goal: '整理竞品',
      status: 'queued',
      statusReason: null,
      evidence: null,
      reservedTokens: 0,
      depth: 1,
      archivedAt: null,
      createdAt: '2026-11-04T00:00:00.000Z',
      updatedAt: '2026-11-04T00:00:00.000Z',
      endedAt: null,
    };
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes('/start')) {
        return new Response(
          JSON.stringify({
            success: false,
            error: { code: 'VALIDATION_ERROR', message: '分支准入拒绝：并发分支数已达上限' },
          }),
          { status: 422, headers: { 'content-type': 'application/json' } },
        );
      }
      return ok({
        branches: [branch],
        budget: {
          rootConversationId: 'c1',
          usedTokens: 0,
          reservedTokens: 0,
          limitTokens: 200000,
          activeCount: 3,
        },
      });
    });

    renderWithProviders(<BranchPanel conversationId="c1" />);
    const card = await screen.findByTestId('branch-card-b1');
    await userEvent.click(within(card).getByRole('button', { name: '开始' }));
    expect(await screen.findByTestId('branch-start-error')).toHaveTextContent(
      '并发分支数已达上限',
    );
  });
});
