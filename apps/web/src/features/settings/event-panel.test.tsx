// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import type { AppSettings } from '@wbfm/shared/types';
import { renderWithProviders } from '@/test/render';
import { EventPanel } from './event-panel';

function ok(data: unknown) {
  return new Response(JSON.stringify({ success: true, data }), {
    headers: { 'content-type': 'application/json' },
  });
}

const BASE_SETTINGS: AppSettings = {
  defaultChatModelId: null,
  defaultEmbeddingModelId: null,
  theme: 'light',
  language: 'zh-CN',
  hasOnboarded: true,
};

describe('EventPanel（v1.7 剧情演出设置）', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
  });
  afterEach(() => vi.unstubAllGlobals());

  it('默认启用；关闭总开关后 PUT eventsEnabled=false 且剧本列表隐藏', async () => {
    // mockImplementation：GET/PUT/失效重取各读一次 body，不能复用同一 Response 实例
    fetchMock.mockImplementation(async () => ok(BASE_SETTINGS));
    renderWithProviders(<EventPanel />);

    const toggle = await screen.findByTestId('event-enabled-toggle');
    expect(toggle).toBeChecked();
    expect(screen.getByText('内置剧本')).toBeInTheDocument();

    // fireEvent 单击：避免 jsdom 下 userEvent 对 label 包裹 checkbox 的双重激活
    fireEvent.click(toggle);
    const putCall = await waitFor(() => {
      const call = fetchMock.mock.calls.find(
        ([url, init]) => url === '/api/settings' && (init as RequestInit)?.method === 'PUT',
      );
      expect(call).toBeTruthy();
      return call!;
    });
    expect(JSON.parse((putCall[1] as RequestInit).body as string)).toEqual({
      eventsEnabled: false,
    });
    await waitFor(() => expect(screen.queryByText('内置剧本')).toBeNull());
  });

  it('频率三档切换写入 eventFrequencyTier', async () => {
    // GET 回默认档（保证 high 可点）；PUT/重取回 high
    fetchMock.mockImplementation(async (_url: string, init?: RequestInit) =>
      ok(
        init?.method === 'PUT'
          ? { ...BASE_SETTINGS, eventFrequencyTier: 'high' }
          : BASE_SETTINGS,
      ),
    );
    renderWithProviders(<EventPanel />);

    const btn = await screen.findByTestId('event-tier-high');
    fireEvent.click(btn);
    await waitFor(() => {
      const bodies = fetchMock.mock.calls
        .filter(([url, init]) => url === '/api/settings' && (init as RequestInit)?.method === 'PUT')
        .map(([, init]) => (init as RequestInit).body);
      expect(bodies).toContain(JSON.stringify({ eventFrequencyTier: 'high' }));
    });
  });

  it('单剧本停用：取消勾选写入 disabledEventIds（含该 id）', async () => {
    fetchMock.mockImplementation(async (_url: string, init?: RequestInit) =>
      ok(
        init?.method === 'PUT'
          ? { ...BASE_SETTINGS, disabledEventIds: ['ev.touch.shy'] }
          : BASE_SETTINGS,
      ),
    );
    renderWithProviders(<EventPanel />);

    const sceneToggle = (await screen.findByTestId(
      'event-scene-toggle-ev.touch.shy',
    )) as HTMLInputElement;
    expect(sceneToggle.checked).toBe(true);
    fireEvent.click(sceneToggle);

    await waitFor(() => {
      const call = fetchMock.mock.calls.find(
        ([url, init]) => url === '/api/settings' && (init as RequestInit)?.method === 'PUT',
      );
      expect(call).toBeTruthy();
      const body = JSON.parse((call![1] as RequestInit).body as string);
      expect(body.disabledEventIds).toEqual(['ev.touch.shy']);
    });
  });
});
