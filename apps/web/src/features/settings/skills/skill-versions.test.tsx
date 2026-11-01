// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { SkillInfo } from '@wbfm/shared/types';
import { renderWithProviders } from '@/test/render';
import { SkillVersionsPanel } from './skill-versions';

const skill: SkillInfo = {
  id: '1',
  name: 'my-skill',
  enabled: true,
  sourcePath: '/data/skills/my-skill',
  manifest: null,
  error: null,
  exists: true,
};

function ok(data: unknown) {
  return new Response(JSON.stringify({ success: true, data }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

describe('技能版本面板（v2.15 占用与删除）', () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  let data: {
    versions: Array<{
      id: string;
      version: string;
      checksum: string;
      sizeBytes: number;
      createdAt: string;
      active: boolean;
    }>;
    versioningAvailable: boolean;
    totalBytes: number;
  };

  beforeEach(() => {
    data = {
      versions: [
        {
          id: 'v2',
          version: '2.0.0',
          checksum: 'b'.repeat(64),
          sizeBytes: 1024,
          createdAt: '2026-10-31T01:00:00.000Z',
          active: true,
        },
        {
          id: 'v1',
          version: '1.0.0',
          checksum: 'a'.repeat(64),
          sizeBytes: 1024,
          createdAt: '2026-10-31T00:00:00.000Z',
          active: false,
        },
      ],
      versioningAvailable: true,
      totalBytes: 2048,
    };
    fetchMock = vi.fn((url: string, init?: RequestInit) => {
      if (url === '/api/skills/my-skill/versions/1.0.0' && init?.method === 'DELETE') {
        data = { ...data, versions: [data.versions[0]!], totalBytes: 1024 };
        return Promise.resolve(
          ok({
            deleted: { version: '1.0.0', rowsRemoved: 1, freedBytes: 1024, dirDeleted: true },
            versions: data,
          }),
        );
      }
      return Promise.resolve(ok(data));
    });
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('展示总占用；active 无删除；删除非启用版本后刷新', async () => {
    const user = userEvent.setup();
    renderWithProviders(<SkillVersionsPanel skill={skill} />);

    await screen.findByTestId('skill-versions');
    expect(screen.getByTestId('skill-versions-total').textContent).toContain('共 2 版');
    expect(screen.getByTestId('skill-version-protected').textContent).toContain(
      '当前版本，不可删除',
    );
    expect(screen.queryByTestId('skill-version-delete-2.0.0')).toBeNull();

    await user.click(screen.getByTestId('skill-version-delete-1.0.0'));
    await user.click(await screen.findByRole('button', { name: '确认删除' }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/skills/my-skill/versions/1.0.0',
        expect.objectContaining({ method: 'DELETE' }),
      ),
    );
    await waitFor(() =>
      expect(screen.getByTestId('skill-versions-total').textContent).toContain('共 1 版'),
    );
  });
});
