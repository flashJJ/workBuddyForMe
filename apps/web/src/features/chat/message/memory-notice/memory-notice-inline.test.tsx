// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '@/test/render';
import { MemoryNoticeInline } from './memory-notice-inline';

function ok(data: unknown) {
  return new Response(JSON.stringify({ success: true, data }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

describe('MemoryNoticeInline（v2.28 P1）', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn().mockResolvedValue(ok({}));
    vi.stubGlobal('fetch', fetchMock);
  });
  afterEach(() => vi.unstubAllGlobals());

  it('无提示时不渲染', () => {
    renderWithProviders(<MemoryNoticeInline />);
    expect(screen.queryByTestId('memory-notice')).toBeNull();
  });

  it('合并展示最多 2 条，撤销走归档 PATCH 并变为已撤销', async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <MemoryNoticeInline
        notices={[
          { id: 'm1', content: '用户对花生过敏' },
          { id: 'm2', content: '用户不能吃海鲜' },
        ]}
      />,
    );

    const row = screen.getByTestId('memory-notice');
    expect(row).toHaveTextContent('已记住：');
    expect(row).toHaveTextContent('用户对花生过敏');
    expect(row).toHaveTextContent('用户不能吃海鲜');

    await user.click(screen.getAllByTestId('memory-notice-undo')[0]!);
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/api/memories/m1'),
      expect.objectContaining({ method: 'PATCH' }),
    );
    expect(await screen.findByText('已撤销')).toBeInTheDocument();
  });
});
