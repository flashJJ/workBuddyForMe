// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { RunEvidenceReport } from '@wbfm/shared/schemas';
import { renderWithProviders } from '@/test/render';
import { RunReportPage } from './run-report-page';

const REPORT: RunEvidenceReport = {
  from: '2026-10-14',
  to: '2026-10-20',
  filter: 'all',
  totals: {
    total: 8,
    succeeded: 3,
    failed: 4,
    cancelled: 1,
    running: 0,
    successRate: 37.5,
    medianDurationMs: 4500,
    failures: [{ code: 'max_steps', count: 1 }],
  },
  chains: [
    {
      chain: 'task',
      total: 4,
      succeeded: 1,
      failed: 2,
      cancelled: 1,
      running: 0,
      successRate: 25,
      medianDurationMs: 2500,
      failures: [{ code: 'max_steps', count: 1 }],
    },
    {
      chain: 'flow',
      total: 2,
      succeeded: 1,
      failed: 1,
      cancelled: 0,
      running: 0,
      successRate: 50,
      medianDurationMs: 5500,
      failures: [{ code: 'NODE_FAILED', count: 1 }],
    },
    {
      chain: 'agent',
      total: 2,
      succeeded: 1,
      failed: 1,
      cancelled: 0,
      running: 0,
      successRate: 50,
      medianDurationMs: 7500,
      failures: [{ code: 'budget_exceeded', count: 1 }],
    },
  ],
};

describe('v2.6 M5 运行报告页', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('format=markdown')) {
        return new Response('# 运行报告\n', {
          headers: {
            'content-type': 'text/markdown; charset=utf-8',
            'content-disposition': 'attachment; filename="run-report-test.md"',
          },
        });
      }
      if (url.includes('format=csv')) {
        return new Response('chain,total\n', {
          headers: {
            'content-type': 'text/csv; charset=utf-8',
            'content-disposition': 'attachment; filename="run-report-test.csv"',
          },
        });
      }
      return new Response(JSON.stringify({ success: true, data: REPORT }), {
        headers: { 'content-type': 'application/json' },
      });
    });
    vi.stubGlobal('fetch', fetchMock);
    vi.stubGlobal('URL', {
      ...URL,
      createObjectURL: vi.fn(() => 'blob:test'),
      revokeObjectURL: vi.fn(),
    });
  });

  afterEach(() => vi.unstubAllGlobals());

  it('渲染总计、链路表格与失败类别', async () => {
    renderWithProviders(<RunReportPage />);

    expect(await screen.findByText('37.5%')).toBeInTheDocument();
    expect(screen.getByText('4.5s')).toBeInTheDocument();
    expect(screen.getByText('8')).toBeInTheDocument();

    const table = screen.getByTestId('run-report-table');
    expect(within(table).getByText('任务')).toBeInTheDocument();
    expect(within(table).getByText('工作流')).toBeInTheDocument();
    expect(within(table).getByText('协作')).toBeInTheDocument();
    expect(within(table).getByText('25%')).toBeInTheDocument();

    const failures = screen.getByTestId('run-report-failures');
    expect(failures).toHaveTextContent('max_steps');
    expect(failures).toHaveTextContent('NODE_FAILED');
    expect(failures).toHaveTextContent('budget_exceeded');
  });

  it('切换链路触发带 chain=flow 的查询', async () => {
    renderWithProviders(<RunReportPage />);
    await screen.findByTestId('run-report-table');

    fireEvent.keyDown(screen.getByLabelText('链路筛选'), { key: 'ArrowDown' });
    fireEvent.click(screen.getByRole('option', { name: '工作流' }));

    await waitFor(() =>
      expect(
        fetchMock.mock.calls.some((call) => String(call[0]).includes('chain=flow')),
      ).toBe(true),
    );
  });

  it('导出 Markdown/CSV 调用对应格式并下载', async () => {
    const user = userEvent.setup();
    renderWithProviders(<RunReportPage />);
    await screen.findByTestId('run-report-table');

    await user.click(screen.getByTestId('run-report-export-md'));
    await waitFor(() =>
      expect(
        fetchMock.mock.calls.some((call) => String(call[0]).includes('format=markdown')),
      ).toBe(true),
    );

    await user.click(screen.getByTestId('run-report-export-csv'));
    await waitFor(() =>
      expect(
        fetchMock.mock.calls.some((call) => String(call[0]).includes('format=csv')),
      ).toBe(true),
    );
  });
});
