// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '@/test/render';
import { ScriptSchedulePanel } from './script-schedule-panel';

const fetchMock = vi.fn();

vi.stubGlobal('fetch', fetchMock);

function ok(data: unknown) {
  return Promise.resolve(
    new Response(JSON.stringify({ success: true, data }), {
      headers: { 'content-type': 'application/json' },
    }),
  );
}

describe('ScriptSchedulePanel', () => {
  it('读取开关、每日次数与回顾保留，可切换并持久化', async () => {
    let schedule = { enabled: false, perDay: 5, runsToday: 0 };
    let journal = { retentionDays: null as number | null };
    let playback = { perDay: 3, playsToday: 0, idleMinutes: 10, playedSceneIds: [] as string[] };
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url === '/api/pet/script' && (!init || init.method === 'GET')) {
        return ok({
          scenes: [],
          usage: { calls: 0, callLimit: 8, tokens: 0, tokenLimit: 60_000 },
          story: { openThreads: 0, cliffhanger: null, recentThemes: [], recentProps: [] },
          schedule,
        });
      }
      if (url === '/api/pet/script/schedule') {
        const patch = JSON.parse(String(init?.body ?? '{}')) as {
          enabled?: boolean;
          perDay?: number;
        };
        schedule = { ...schedule, ...patch };
        return ok({ schedule });
      }
      if (url === '/api/pet/script/journal/settings') {
        if (init?.method === 'POST') {
          const patch = JSON.parse(String(init.body ?? '{}')) as {
            retentionDays: number | null;
          };
          journal = { retentionDays: patch.retentionDays };
        }
        return ok(journal);
      }
      if (url === '/api/pet/script/playback') {
        if (init?.method === 'POST') {
          playback = { ...playback, ...(JSON.parse(String(init.body ?? '{}')) as object) };
        }
        return ok(playback);
      }
      return ok(null);
    });

    renderWithProviders(<ScriptSchedulePanel />);

    const checkbox = await screen.findByTestId('script-schedule-enabled');
    const perDay = screen.getByTestId('script-schedule-per-day');
    const retention = screen.getByTestId('journal-retention');
    const playbackPerDay = screen.getByTestId('playback-per-day');
    expect(checkbox).not.toBeChecked();
    expect(perDay).toHaveValue('5');
    expect(retention).toHaveValue('forever');
    expect(playbackPerDay).toHaveValue('3');
    expect(screen.getByTestId('playback-idle')).toHaveValue('10');
    await screen.findByText('今日已自动生成 0/5 次');
    await screen.findByText('今日已主动播放 0/3 场');

    await userEvent.setup().click(checkbox);

    await waitFor(() => expect(checkbox).toBeChecked());
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/pet/script/schedule',
      expect.objectContaining({ method: 'POST', body: JSON.stringify({ enabled: true }) }),
    );

    await userEvent.setup().selectOptions(perDay, '3');

    await waitFor(() => expect(perDay).toHaveValue('3'));
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/pet/script/schedule',
      expect.objectContaining({ method: 'POST', body: JSON.stringify({ perDay: 3 }) }),
    );
    await screen.findByText('今日已自动生成 0/3 次');

    await userEvent.setup().selectOptions(retention, '30');

    await waitFor(() => expect(retention).toHaveValue('30'));
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/pet/script/journal/settings',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ retentionDays: 30 }),
      }),
    );

    await userEvent.setup().selectOptions(playbackPerDay, '2');

    await waitFor(() => expect(playbackPerDay).toHaveValue('2'));
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/pet/script/playback',
      expect.objectContaining({ method: 'POST', body: JSON.stringify({ perDay: 2 }) }),
    );
  });
});
