// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { AuditEventView } from '@wbfm/shared/schemas';
import { renderWithProviders } from '@/test/render';
import { AuditPage } from './audit-page';

vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams('runId=run-1'),
}));

const event: AuditEventView = {
  id: 'ev-1',
  seq: 1,
  createdAt: '2026-10-31T00:00:00.000Z',
  kind: 'run_started',
  actor: 'agent',
  runId: 'run-1',
  conversationId: null,
  tool: null,
  decision: null,
  reasonCode: null,
  policyHash: null,
  binding: null,
  outcome: null,
  prevHash: 'GENESIS',
  hash: 'h1',
};

function ok(data: unknown) {
  return new Response(JSON.stringify({ success: true, data }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

describe('审计页 runId 下钻（v2.14）', () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  let replaceState: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    replaceState = vi.spyOn(window.history, 'replaceState');
    window.history.replaceState(null, '', '/audit?runId=run-1');
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('?runId= 预填过滤并直达事件；事件行提供时间线入口', async () => {
    fetchMock.mockImplementation((url: string) => {
      if (url.includes('/api/audit/verify')) {
        return Promise.resolve(ok({ ok: true, checked: 1, firstBrokenSeq: null }));
      }
      return Promise.resolve(ok({ events: [event], nextCursor: null }));
    });

    renderWithProviders(<AuditPage />);

    expect(await screen.findByDisplayValue('run-1')).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/api/audit/events?limit=100&runId=run-1'),
      expect.anything(),
    );
    const link = await screen.findByTestId('audit-view-task-1');
    expect(link.getAttribute('href')).toBe('/timeline?scope=task&id=run-1');
  });

  it('清空过滤同步移除地址栏 runId', async () => {
    fetchMock.mockImplementation((url: string) => {
      if (url.includes('/api/audit/verify')) {
        return Promise.resolve(ok({ ok: true, checked: 0, firstBrokenSeq: null }));
      }
      return Promise.resolve(ok({ events: [], nextCursor: null }));
    });
    const user = userEvent.setup();
    renderWithProviders(<AuditPage />);

    const input = await screen.findByDisplayValue('run-1');
    fireEvent.change(input, { target: { value: '' } });
    await user.click(screen.getByRole('button', { name: '重置' }));

    await waitFor(() => expect(replaceState).toHaveBeenCalled());
    expect(replaceState.mock.lastCall?.[2]).toBe('/audit');
    expect(await screen.findByText('还没有审计事件。')).toBeTruthy();
  });
});
