// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import { renderWithProviders } from '@/test/render';
import { ScriptQuality } from './script-quality';

const fetchMock = vi.fn();

vi.stubGlobal('fetch', fetchMock);

function ok(data: unknown) {
  return Promise.resolve(
    new Response(JSON.stringify({ success: true, data }), {
      headers: { 'content-type': 'application/json' },
    }),
  );
}

const REPORT = {
  window: 50,
  count: 8,
  repeats: 2,
  repeatRate: 0.25,
  dedupeHits: 3,
  dedupeRate: 0.375,
  freshHits: 6,
  freshRate: 0.75,
  prefHits: 2,
  prefRate: 0.25,
  longSceneHits: 1,
  avgScore: 0.64,
  topReasons: [
    { code: 'fresh:unplayed', count: 6 },
    { code: 'dedupe:theme', count: 2 },
  ],
  gate: {
    perDay: 3,
    playsToday: 1,
    budgetRemaining: 2,
    unplayedScenes: 4,
    quietHoursActive: true,
  },
};

describe('ScriptQuality', () => {
  it('展示命中率、门控与高频理由', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (String(url).startsWith('/api/pet/script/quality')) return ok(REPORT);
      return ok(null);
    });

    renderWithProviders(<ScriptQuality />);

    expect(await screen.findByTestId('script-quality-window')).toBeTruthy();
    expect(screen.getByText('最近 8/50 条')).toBeTruthy();
    expect(screen.getByTestId('script-quality-repeatRate').textContent).toBe('25%');
    expect(screen.getByTestId('script-quality-dedupeRate').textContent).toBe('38%');
    expect(screen.getByTestId('script-quality-prefRate').textContent).toBe('25%');
    expect(screen.getByTestId('script-quality-freshRate').textContent).toBe('75%');
    expect(screen.getByText(/剩余 2\/3 场/)).toBeTruthy();
    expect(screen.getByText(/生效中/)).toBeTruthy();
    expect(screen.getByText(/今日未播 ×6/)).toBeTruthy();
  });

  it('没有决策时展示空态', async () => {
    fetchMock.mockImplementation(async () => ok({ ...REPORT, count: 0 }));

    renderWithProviders(<ScriptQuality />);

    expect(await screen.findByTestId('script-quality-empty')).toBeTruthy();
    expect(screen.getByText(/还没有足够的决策记录/)).toBeTruthy();
  });

  it('接口失败时降级提示', async () => {
    fetchMock.mockImplementation(async () => Promise.reject(new Error('offline')));

    renderWithProviders(<ScriptQuality />);

    expect(await screen.findByTestId('script-quality-unavailable')).toBeTruthy();
  });
});
