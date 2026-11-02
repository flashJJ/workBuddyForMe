// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import type { ArtifactRef } from '@wbfm/shared/types';
import { renderWithProviders } from '@/test/render';
import { downloadApiFile } from '@/lib/api/download';
import { ArtifactCard } from './artifact-card';
import { downloadBlobFile, extractArtifactSvg, rasterizeSvg } from './artifact-export';

vi.mock('@/lib/api/download', () => ({ downloadApiFile: vi.fn(async () => undefined) }));
vi.mock('./artifact-export', () => ({
  extractArtifactSvg: vi.fn(),
  exportFileName: vi.fn(
    (filename: string, extension: string) => `${filename.replace(/\.[^.]+$/, '')}.${extension}`,
  ),
  downloadBlobFile: vi.fn(),
  rasterizeSvg: vi.fn(async () => new Blob(['png'], { type: 'image/png' })),
}));

const ref: ArtifactRef = {
  attachmentId: 'att-1',
  title: '架构图',
  filename: 'architecture.html',
  format: 'html',
  mimeType: 'text/html',
  byteSize: 4096,
};

describe('ArtifactCard（v2.18 M1/M3）', () => {
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
    vi.mocked(extractArtifactSvg).mockReturnValue({ svg: '<svg/>', width: 100, height: 60 });
    vi.mocked(downloadBlobFile).mockClear();
    vi.mocked(rasterizeSvg).mockClear();
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

  it('导出 SVG：读取产物文本、提取内联 SVG 并下载', async () => {
    renderWithProviders(<ArtifactCard artifact={ref} />);
    fireEvent.click(screen.getByRole('button', { name: /导出 SVG/ }));

    await waitFor(() => expect(downloadBlobFile).toHaveBeenCalled());
    expect(extractArtifactSvg).toHaveBeenCalledWith(
      '<html><body>hi</body></html>',
      'html',
    );
    expect(downloadBlobFile).toHaveBeenCalledWith(expect.any(Blob), 'architecture.svg');
    expect(rasterizeSvg).not.toHaveBeenCalled();
  });

  it('导出 PNG：2 倍栅格化后下载', async () => {
    renderWithProviders(<ArtifactCard artifact={ref} />);
    fireEvent.click(screen.getByRole('button', { name: /导出 PNG/ }));

    await waitFor(() => expect(downloadBlobFile).toHaveBeenCalled());
    expect(rasterizeSvg).toHaveBeenCalledWith({ svg: '<svg/>', width: 100, height: 60 }, 2);
    expect(downloadBlobFile).toHaveBeenCalledWith(expect.any(Blob), 'architecture.png');
  });

  it('产物中没有 SVG 时给出明确提示且不下载', async () => {
    vi.mocked(extractArtifactSvg).mockReturnValueOnce(null);
    renderWithProviders(<ArtifactCard artifact={ref} />);
    fireEvent.click(screen.getByRole('button', { name: /导出 SVG/ }));

    expect(await screen.findByRole('alert')).toHaveTextContent('产物中没有可导出的 SVG');
    expect(downloadBlobFile).not.toHaveBeenCalled();
  });

  it('导出异常时提示导出失败', async () => {
    vi.mocked(extractArtifactSvg).mockImplementationOnce(() => {
      throw new Error('bad svg');
    });
    renderWithProviders(<ArtifactCard artifact={ref} />);
    fireEvent.click(screen.getByRole('button', { name: /导出 PNG/ }));

    expect(await screen.findByRole('alert')).toHaveTextContent('导出失败');
  });

  it('Markdown 产物不展示导出按钮', () => {
    renderWithProviders(
      <ArtifactCard
        artifact={{
          ...ref,
          filename: 'notes.md',
          format: 'md',
          mimeType: 'text/markdown',
        }}
      />,
    );
    expect(screen.queryByRole('button', { name: /导出/ })).not.toBeInTheDocument();
  });
});
