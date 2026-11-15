// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import { renderWithProviders } from '@/test/render';
import { findTheaterEpisode } from '../theater-script';
import { StageShareCard, StageTheaterOverlay } from '../stage-share-card';

const fetchMock = vi.fn();

vi.stubGlobal('fetch', fetchMock);

function ok(data: unknown) {
  return Promise.resolve(
    new Response(JSON.stringify({ success: true, data }), {
      headers: { 'content-type': 'application/json' },
    }),
  );
}

const EPISODE = findTheaterEpisode();
const LINE = EPISODE.lines[0]!;

function renderCard(over: { uiHidden?: boolean } = {}) {
  return renderWithProviders(
    <StageShareCard
      episode={EPISODE}
      line={LINE}
      index={0}
      total={EPISODE.lines.length}
      uiHidden={over.uiHidden ?? false}
      onSave={() => {}}
      onClose={() => {}}
    />,
  );
}

describe('小剧场分享卡（M4）', () => {
  it('展示标题、台词、席位与今日数据', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (String(url).startsWith('/api/pet/script/playback')) {
        return ok({ perDay: 3, playsToday: 2, idleMinutes: 10, playedSceneIds: [] });
      }
      if (String(url) === '/api/pet/script') {
        return ok({ scenes: [{}, {}], usage: {}, story: {}, sceneMeta: {}, schedule: {} });
      }
      return ok(null);
    });

    renderCard();

    expect(screen.getByText(EPISODE.title)).toBeTruthy();
    expect(screen.getByText(LINE.text)).toBeTruthy();
    expect(screen.getByText('雪团')).toBeTruthy();
    expect(await screen.findByText('2/3')).toBeTruthy();
    expect(await screen.findByText('2')).toBeTruthy();
  });

  it('接口失败时显示占位符，不阻断卡面', async () => {
    fetchMock.mockImplementation(async () => Promise.reject(new Error('offline')));

    renderCard();

    expect(screen.getByText(LINE.text)).toBeTruthy();
    expect(await screen.findAllByText('--')).toHaveLength(2);
  });

  it('截图隐藏 UI 时保留卡面但隐藏按钮', () => {
    fetchMock.mockImplementation(async () => ok(null));

    renderCard({ uiHidden: true });

    expect(screen.getByTestId('stage-share-card')).toBeTruthy();
    expect(screen.queryByTestId('stage-share-card-save')).toBeNull();
    expect(screen.queryByTestId('stage-share-card-close')).toBeNull();
  });

  it('覆盖层展示轮播角标并按开关渲染分享卡', () => {
    fetchMock.mockImplementation(async () => ok(null));

    const { rerender } = renderWithProviders(
      <StageTheaterOverlay
        episode={EPISODE}
        index={1}
        total={EPISODE.lines.length}
        line={EPISODE.lines[1]!}
        uiHidden={false}
        shareOpen={false}
        onSave={() => {}}
        onClose={() => {}}
      />,
    );
    expect(screen.getByTestId('stage-theater-badge').textContent).toContain('2/6');
    expect(screen.queryByTestId('stage-share-card')).toBeNull();

    rerender(
      <StageTheaterOverlay
        episode={EPISODE}
        index={1}
        total={EPISODE.lines.length}
        line={EPISODE.lines[1]!}
        uiHidden={false}
        shareOpen
        onSave={() => {}}
        onClose={() => {}}
      />,
    );
    expect(screen.getByTestId('stage-share-card')).toBeTruthy();
  });

  it('模型未就绪时显示加载幕布与进度，就绪后消失', () => {
    fetchMock.mockImplementation(async () => ok(null));
    const { rerender } = renderWithProviders(
      <StageTheaterOverlay
        episode={EPISODE}
        index={0}
        total={EPISODE.lines.length}
        line={LINE}
        uiHidden={false}
        shareOpen={false}
        ready={false}
        readyCount={1}
        readyTotal={3}
        onSave={() => {}}
        onClose={() => {}}
      />,
    );
    expect(screen.getByTestId('theater-loading-curtain').textContent).toContain('1/3');

    rerender(
      <StageTheaterOverlay
        episode={EPISODE}
        index={0}
        total={EPISODE.lines.length}
        line={LINE}
        uiHidden={false}
        shareOpen={false}
        ready
        readyCount={3}
        readyTotal={3}
        onSave={() => {}}
        onClose={() => {}}
      />,
    );
    expect(screen.queryByTestId('theater-loading-curtain')).toBeNull();
  });
});
