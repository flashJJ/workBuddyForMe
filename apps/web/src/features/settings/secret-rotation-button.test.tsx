// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '@/test/render';
import { SecretRotationButton } from './secret-rotation-button';

function ok(data: unknown) {
  return new Response(JSON.stringify({ success: true, data }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

describe('凭证轮换按钮（v2.15）', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn(() =>
      Promise.resolve(
        ok({
          mode: 'web',
          total: 1,
          rotated: 1,
          skipped: 0,
          failed: 0,
          skippedProviders: [],
          failedProviders: [],
          keyId: 'k-test',
          legacyKeySynced: true,
        }),
      ),
    );
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('二次确认后调用轮换并展示计数', async () => {
    const user = userEvent.setup();
    renderWithProviders(<SecretRotationButton />);

    await user.click(screen.getByTestId('secret-rotation'));
    await user.click(screen.getByRole('button', { name: '确认轮换' }));

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/secrets/rotate',
      expect.objectContaining({ method: 'POST' }),
    );
    expect(await screen.findByText('已重新加密 1 个凭证；跳过 0 个，失败 0 个。')).toBeVisible();
  });
});
