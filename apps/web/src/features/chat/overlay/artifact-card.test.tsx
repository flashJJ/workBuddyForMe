// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import type { ArtifactRef } from '@wbfm/shared/types';
import { renderWithProviders } from '@/test/render';
import { downloadApiFile } from '@/lib/api/download';
import { ArtifactCard } from './artifact-card';

vi.mock('@/lib/api/download', () => ({ downloadApiFile: vi.fn(async () => undefined) }));

const ref: ArtifactRef = {
  attachmentId: 'att-1',
  title: '架构图',
  filename: 'architecture.html',
  format: 'html',
  mimeType: 'text/html',
  byteSize: 4096,
};

describe('ArtifactCard（v2.18 M1）', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('<html><body>hi</body></html>', { status: 200 })),
    );
    Object.defineProperty(URL, 'createObjectURL', {
      configurable: true,
      value: vi.fn(() => 'blob:artifact'),
    });
    Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: vi.fn() });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.mocked(downloadApiFile).mockClear();
  });

  it('渲染标题/格式/大小，预览走 sandbox iframe', async () => {
    renderWithProviders(<ArtifactCard artifact={ref} />);
    expect(screen.getByText('架构图')).toBeInTheDocument();
    expect(screen.getByText('HTML · 4.0 KB')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /预览/ }));
    await waitFor(() => expect(screen.getByTitle('架构图')).toBeInTheDocument());
    expect(screen.getByTitle('架构图')).toHaveAttribute('sandbox', '');
    expect(fetch).toHaveBeenCalledWith('/api/artifacts/att-1', expect.any(Object));
  });

  it('下载走带令牌的 downloadApiFile', () => {
    renderWithProviders(<ArtifactCard artifact={ref} />);
    fireEvent.click(screen.getByRole('button', { name: /下载/ }));
    expect(downloadApiFile).toHaveBeenCalledWith(
      '/api/artifacts/att-1?download=1',
      'architecture.html',
    );
  });
});
