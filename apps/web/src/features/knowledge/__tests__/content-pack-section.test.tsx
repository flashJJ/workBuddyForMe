// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ContentPackSummary, ContentPackUpdateCheck } from '@wbfm/shared/types';
import { renderWithProviders } from '@/test/render';
import { ContentPackSection } from '../content-pack-section';

const PACK: ContentPackSummary = {
  id: 'how-to-live-better',
  name: '高性价比人生指南',
  description: '767 条循证生活建议。',
  sourceUrl: 'https://github.com/eternity4719/HowToLiveBetter',
  license: 'CC BY 4.0',
  licenseUrl: 'https://creativecommons.org/licenses/by/4.0/',
  version: 'e2605d3',
  publishedAt: '2026-10-21',
  fileCount: 34,
  totalBytes: 2385074,
  sha256: '7095f7cb286a8ef634750251ef47db7c8de98ce4d5b22a36878ceab619ffff46',
  disclaimer: '仅按书检索与引用。',
  imported: false,
  documentCount: 0,
};

const BASE: ContentPackUpdateCheck = {
  id: PACK.id,
  currentVersion: PACK.version,
  latestVersion: PACK.version,
  updateAvailable: false,
  checkedAt: '2026-11-09T00:00:00.000Z',
  sourceUrl: PACK.sourceUrl,
  status: 'latest',
};

function ok(data: unknown) {
  return new Response(JSON.stringify({ success: true, data }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

describe('内容包检查更新（v2.30）', () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  let nextResult: ContentPackUpdateCheck;

  beforeEach(() => {
    nextResult = { ...BASE };
    fetchMock = vi.fn(async (url: string) => {
      if (url === '/api/content-packs') return ok([PACK]);
      if (url === '/api/content-packs/how-to-live-better/update-check') return ok(nextResult);
      return ok(null);
    });
    vi.stubGlobal('fetch', fetchMock);
  });
  afterEach(() => vi.unstubAllGlobals());

  it('点击按钮才请求；三种结果文案可读', async () => {
    const user = userEvent.setup();
    renderWithProviders(<ContentPackSection />);
    const button = await screen.findByTestId('content-pack-check-how-to-live-better');
    expect(fetchMock).not.toHaveBeenCalledWith(
      '/api/content-packs/how-to-live-better/update-check',
      expect.anything(),
    );

    await user.click(button);
    expect(await screen.findByTestId('content-pack-update-how-to-live-better')).toHaveTextContent(
      '已是最新（e2605d3）',
    );

    nextResult = {
      ...BASE,
      status: 'update-available',
      latestVersion: 'def5678',
      updateAvailable: true,
    };
    await user.click(button);
    await waitFor(() =>
      expect(screen.getByTestId('content-pack-update-how-to-live-better')).toHaveTextContent(
        '上游有更新：e2605d3 → def5678',
      ),
    );

    nextResult = {
      ...BASE,
      status: 'unavailable',
      latestVersion: null,
      reason: '上游仓库暂时不可达（HTTP 403）',
    };
    await user.click(button);
    await waitFor(() =>
      expect(screen.getByTestId('content-pack-update-how-to-live-better')).toHaveTextContent(
        '暂时无法检查更新：上游仓库暂时不可达（HTTP 403）',
      ),
    );
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/content-packs/how-to-live-better/update-check',
      expect.anything(),
    );
  });
});
