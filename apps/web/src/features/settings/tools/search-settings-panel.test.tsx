// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '@/test/render';
import { SearchSettingsPanel } from './search-settings-panel';

const fetchMock = vi.fn();

vi.stubGlobal('fetch', fetchMock);

function ok(data: unknown) {
  return Promise.resolve(
    new Response(JSON.stringify({ success: true, data }), {
      headers: { 'content-type': 'application/json' },
    }),
  );
}

describe('SearchSettingsPanel', () => {
  it('加载设置并可测试连接', async () => {
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url === '/api/settings' && (!init || init.method === 'GET')) {
        return ok({
          searchSettings: {
            provider: 'searxng',
            endpoint: 'http://127.0.0.1:8080',
            maxResults: 5,
            timeoutMs: 10000,
            allowPrivateEndpoint: true,
          },
        });
      }
      if (url === '/api/search/test') return ok({ ok: true, message: 'SearXNG 搜索服务可用' });
      return ok(null);
    });

    renderWithProviders(<SearchSettingsPanel />);
    await screen.findByText('联网搜索');
    // 公共实例预设：Web 模式也能零配置选一个（一键部署仅在桌面端出现）
    expect(screen.getByText('公共实例')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '一键部署' })).not.toBeInTheDocument();

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: '测试连接' }));
    await screen.findByText('SearXNG 搜索服务可用');
    expect(fetchMock).toHaveBeenCalledWith('/api/search/test', expect.anything());
  });
});
