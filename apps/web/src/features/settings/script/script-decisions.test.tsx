// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import { renderWithProviders } from '@/test/render';
import { ScriptDecisions } from './script-decisions';

const fetchMock = vi.fn();

vi.stubGlobal('fetch', fetchMock);

function ok(data: unknown) {
  return Promise.resolve(
    new Response(JSON.stringify({ success: true, data }), {
      headers: { 'content-type': 'application/json' },
    }),
  );
}

const RECORD = {
  at: 1_763_100_000_000,
  sceneId: 'gen.teacup',
  title: '喝茶',
  source: 'proactive',
  score: 0.78,
  reasons: [
    { code: 'hour:late-night', delta: 0.12 },
    { code: 'work:busy-short', delta: 0.09 },
  ],
  context: { hour: 23, idleMinutes: 42, level: 2, mood: 'low', work: 'busy' },
};

describe('ScriptDecisions', () => {
  it('展示最近决策的标题、来源、得分与理由', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (String(url).startsWith('/api/pet/script/decisions')) {
        return ok({ decisions: [RECORD] });
      }
      return ok(null);
    });

    renderWithProviders(<ScriptDecisions />);

    expect(await screen.findByText('喝茶')).toBeTruthy();
    expect(screen.getByText(/· 主动播放/)).toBeTruthy();
    expect(screen.getByText('得分 0.78')).toBeTruthy();
    expect(screen.getByText(/深夜偏好\+0\.12/)).toBeTruthy();
    expect(screen.getByText(/忙碌选短\+0\.09/)).toBeTruthy();
  });

  it('没有记录时展示空态', async () => {
    fetchMock.mockImplementation(async () => ok({ decisions: [] }));

    renderWithProviders(<ScriptDecisions />);

    expect(await screen.findByTestId('script-decisions-empty')).toBeTruthy();
    expect(screen.getByText(/还没有决策记录/)).toBeTruthy();
  });
});
