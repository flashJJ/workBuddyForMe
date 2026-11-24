// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { renderWithProviders } from '@/test/render';
import { RunSnapshotsPanel } from './run-snapshots-panel';

const mocks = vi.hoisted(() => ({
  mutateAsync: vi.fn(),
  refetch: vi.fn(),
}));

vi.mock('@/lib/hooks/flows', () => ({
  useRunSnapshots: () => ({
    data: {
      snapshots: [
        {
          id: 's1',
          runId: 'r1',
          nodeId: null,
          toolName: 'write_file',
          action: 'write_overwrite',
          path: 'D:/workspace/a.txt',
          targetPath: null,
          existedBefore: true,
          byteSize: 1024,
          sha256: 'a'.repeat(64),
          writtenSha256: 'b'.repeat(64),
          blobPath: 'a'.repeat(64),
          truncated: false,
          truncationReason: null,
          createdAt: '2026-11-24T00:00:00.000Z',
        },
      ],
      usage: { bytes: 1024, count: 1, quotaBytes: 1024 * 1024 },
    },
    refetch: mocks.refetch,
  }),
  useRollbackRun: () => ({ mutateAsync: mocks.mutateAsync, isPending: false }),
}));

describe('RunSnapshotsPanel（v5.1）', () => {
  it('预览冲突后按钮切换为强制回滚', async () => {
    mocks.mutateAsync.mockResolvedValue({
      runId: 'r1',
      dryRun: true,
      totals: { restored: 0, deleted: 0, skipped: 0, conflict: 1, failed: 0 },
      entries: [
        {
          path: 'D:/workspace/a.txt',
          action: 'write_overwrite',
          status: 'conflict',
          reason: 'hash_mismatch',
        },
      ],
    });
    renderWithProviders(<RunSnapshotsPanel runId="r1" />);
    expect(screen.getByText(/D:\/workspace\/a\.txt/)).toBeTruthy();

    fireEvent.click(screen.getByText('回滚预览'));
    await waitFor(() =>
      expect(mocks.mutateAsync).toHaveBeenCalledWith({ runId: 'r1', dryRun: true }),
    );
    expect(await screen.findByText('强制回滚')).toBeTruthy();

    fireEvent.click(screen.getByText('强制回滚'));
    await waitFor(() =>
      expect(mocks.mutateAsync).toHaveBeenLastCalledWith({
        runId: 'r1',
        dryRun: false,
        force: ['D:/workspace/a.txt'],
      }),
    );
  });
});
