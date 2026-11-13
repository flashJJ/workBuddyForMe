// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { apiGet } from '@/lib/api/client';
import { renderWithProviders } from '@/test/render';
import { PetJournalPage } from './pet-journal-page';

vi.mock('@/lib/api/client', () => ({ apiGet: vi.fn() }));

const mockedGet = vi.mocked(apiGet);

describe('日常回顾页（P8.6）', () => {
  beforeEach(() => {
    mockedGet.mockReset();
  });

  it('展示当天生成/播放统计与条目', async () => {
    mockedGet.mockResolvedValue({
      date: '2026-11-13',
      generated: 2,
      played: 1,
      items: [
        {
          sceneId: 'gen.a',
          title: '窗边的换季提醒',
          theme: '换季提醒',
          trigger: 'context::workStreak',
          source: 'auto',
          generatedAt: Date.UTC(2026, 10, 13, 6, 30),
          playedAt: Date.UTC(2026, 10, 13, 6, 35),
          playCount: 2,
        },
        {
          sceneId: 'gen.b',
          title: '加班后的一杯茶',
          theme: '',
          trigger: 'context::offWork',
          source: 'manual',
          generatedAt: Date.UTC(2026, 10, 13, 5, 0),
          playedAt: null,
          playCount: 0,
        },
      ],
    } as never);
    renderWithProviders(<PetJournalPage />);
    await waitFor(() => expect(screen.getByText('生成 2 段')).toBeTruthy());
    expect(screen.getByText('已播放 1 段')).toBeTruthy();
    expect(screen.getByText('窗边的换季提醒')).toBeTruthy();
    expect(screen.getByText('播放 2 次')).toBeTruthy();
    expect(screen.getByText('还没播放过')).toBeTruthy();
    expect(screen.getByText('未记录主题')).toBeTruthy();
    expect(screen.getByText('自动')).toBeTruthy();
    expect(screen.getByText('手动')).toBeTruthy();
  });

  it('空数据展示引导文案', async () => {
    mockedGet.mockResolvedValue({ date: '2026-11-13', generated: 0, played: 0, items: [] } as never);
    renderWithProviders(<PetJournalPage />);
    await waitFor(() => expect(screen.getByText('这一天还没有剧情')).toBeTruthy());
  });

  it('可以手动选择日期并重新拉取', async () => {
    mockedGet.mockResolvedValue({
      date: '2026-11-12',
      generated: 0,
      played: 0,
      items: [],
    } as never);
    renderWithProviders(<PetJournalPage />);
    const picker = await screen.findByLabelText('选择日期');

    fireEvent.change(picker, { target: { value: '2026-11-12' } });

    await waitFor(() =>
      expect(mockedGet).toHaveBeenCalledWith('/api/pet/script/journal?date=2026-11-12'),
    );
  });
});
