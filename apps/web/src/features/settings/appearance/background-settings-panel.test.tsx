// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import type { AppSettings } from '@wbfm/shared/types';
import { renderWithProviders } from '@/test/render';
import { BackgroundSettingsPanel } from './background-settings-panel';

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

describe('BackgroundSettingsPanel（v4.4 背景与壁纸）', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/api/wallpaper-content')) {
        return ok({ version: 'none', wallpapers: [] });
      }
      return ok(BASE_SETTINGS);
    });
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    delete (window as unknown as { wbfm?: unknown }).wbfm;
  });

  it('切换作用域与背景源后保存到 settings.background', async () => {
    renderWithProviders(<BackgroundSettingsPanel />);
    await waitFor(() => expect(screen.getByTestId('background-source')).toBeTruthy());

    fireEvent.click(screen.getByTestId('background-scope-stage'));
    fireEvent.change(screen.getByTestId('background-source'), {
      target: { value: 'builtin:wallpaper.dusk' },
    });
    fireEvent.click(screen.getByText('保存'));

    await waitFor(() => {
      const put = fetchMock.mock.calls.find((call) => {
        const init = call[1] as RequestInit | undefined;
        return init?.method === 'PUT';
      });
      expect(put).toBeTruthy();
      const body = JSON.parse(String((put![1] as RequestInit).body));
      expect(body.background.stage.source).toEqual({ kind: 'builtin', id: 'wallpaper.dusk' });
    });
  });

  it('无桌面桥时提示仅桌面端可用', async () => {
    renderWithProviders(<BackgroundSettingsPanel />);
    await waitFor(() => expect(screen.getByText(/本地文件仅桌面端可用/)).toBeTruthy());
  });
});
