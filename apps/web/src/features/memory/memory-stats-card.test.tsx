// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { MemoryLifecycleStats } from '@wbfm/shared/types';
import { renderWithProviders } from '@/test/render';
import { MemoryStatsCard } from './memory-stats-card';

function ok(data: unknown, status = 200) {
  return new Response(JSON.stringify({ success: true, data }), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function failure() {
  return new Response(
    JSON.stringify({ success: false, error: { code: 'INTERNAL_ERROR', message: 'boom' } }),
    { status: 500, headers: { 'content-type': 'application/json' } },
  );
}

const stats: MemoryLifecycleStats = {
  total: 12,
  active: 8,
  archived: 3,
  superseded: 1,
  supersededRatio: 0.25,
  recallTotal: 20,
  zeroRecallRate: 0.5,
  userCorrections: 4,
  recentEvents: [
    { id: 2, action: 'create', actor: 'user', createdAt: '2026-03-01T08:00:00.000Z' },
    { id: 1, action: 'supersede', actor: 'system', createdAt: '2026-02-28T08:00:00.000Z' },
  ],
};

describe('记忆统计卡（v2.28 P0-M1）', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
  });
  afterEach(() => vi.unstubAllGlobals());

  it('展示后端口径：整数与百分比只格式化，最近审计带动作与操作者', async () => {
    fetchMock.mockResolvedValue(ok(stats));
    renderWithProviders(<MemoryStatsCard />);

    expect(await screen.findByTestId('memory-stat-total')).toHaveTextContent('12');
    expect(screen.getByTestId('memory-stat-active')).toHaveTextContent('8');
    expect(screen.getByTestId('memory-stat-archived')).toHaveTextContent('3');
    expect(screen.getByTestId('memory-stat-supersededRatio')).toHaveTextContent('25%');
    expect(screen.getByTestId('memory-stat-zeroRecallRate')).toHaveTextContent('50%');
    expect(screen.getByTestId('memory-stat-recallTotal')).toHaveTextContent('20');
    expect(screen.getByTestId('memory-stat-userCorrections')).toHaveTextContent('4');

    const audit = screen.getAllByTestId('memory-audit-item');
    expect(audit).toHaveLength(2);
    expect(audit[0]).toHaveTextContent('新建');
    expect(audit[0]).toHaveTextContent('用户');
    expect(audit[1]).toHaveTextContent('取代');
    expect(audit[1]).toHaveTextContent('系统');
  });

  it('空库显示 0 与 0%，无审计显示空状态', async () => {
    fetchMock.mockResolvedValue(
      ok({
        total: 0,
        active: 0,
        archived: 0,
        superseded: 0,
        supersededRatio: 0,
        recallTotal: 0,
        zeroRecallRate: 0,
        userCorrections: 0,
        recentEvents: [],
      }),
    );
    renderWithProviders(<MemoryStatsCard />);

    expect(await screen.findByTestId('memory-stat-total')).toHaveTextContent('0');
    expect(screen.getByTestId('memory-stat-supersededRatio')).toHaveTextContent('0%');
    expect(screen.getByTestId('memory-stat-zeroRecallRate')).toHaveTextContent('0%');
    expect(screen.getByText('暂无审计记录')).toBeInTheDocument();
  });

  it('加载失败可重试', async () => {
    fetchMock.mockResolvedValueOnce(failure()).mockResolvedValueOnce(ok(stats));
    const user = userEvent.setup();
    renderWithProviders(<MemoryStatsCard />);

    expect(await screen.findByText('统计加载失败')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '重试' }));
    expect(await screen.findByTestId('memory-stat-total')).toHaveTextContent('12');
  });
});
