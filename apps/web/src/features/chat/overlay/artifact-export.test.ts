// @vitest-environment jsdom
import { describe, expect, it, vi, afterEach } from 'vitest';
import {
  downloadBlobFile,
  exportFileName,
  extractArtifactSvg,
  rasterizeSvg,
} from './artifact-export';

function stubObjectUrl(): { create: ReturnType<typeof vi.fn>; revoke: ReturnType<typeof vi.fn> } {
  const create = vi.fn(() => 'blob:artifact');
  const revoke = vi.fn();
  Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: create });
  Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: revoke });
  return { create, revoke };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe('extractArtifactSvg（v2.18 M3）', () => {
  it('HTML 提取第一个内联 SVG，并按 viewBox 补齐 width/height', () => {
    const html = [
      '<!doctype html><html><body><main>',
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 960 600"><rect x="10" y="10" width="20" height="10" fill="#bf4520"/></svg>',
      '</main></body></html>',
    ].join('');

    const parsed = extractArtifactSvg(html, 'html');
    expect(parsed).not.toBeNull();
    expect(parsed!.width).toBe(960);
    expect(parsed!.height).toBe(600);
    expect(parsed!.svg).toContain('width="960"');
    expect(parsed!.svg).toContain('height="600"');
    expect(parsed!.svg).toContain('<rect');
  });

  it('SVG 产物直接规范化，保留命名空间', () => {
    const parsed = extractArtifactSvg(
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 5"><circle cx="5" cy="2" r="1"/></svg>',
      'svg',
    );
    expect(parsed).toEqual({
      svg: expect.stringContaining('<circle'),
      width: 10,
      height: 5,
    });
    expect(parsed!.svg).toContain('xmlns="http://www.w3.org/2000/svg"');
  });

  it('Markdown、无 SVG 的 HTML、非 svg 根节点均返回 null', () => {
    expect(extractArtifactSvg('# 标题', 'md')).toBeNull();
    expect(extractArtifactSvg('<html><body><p>hi</p></body></html>', 'html')).toBeNull();
    expect(extractArtifactSvg('<svg><rect></svg>', 'svg')).toBeNull();
  });
});

describe('文件名与下载', () => {
  it('替换原扩展名并保留中文标题', () => {
    expect(exportFileName('architecture.html', 'svg')).toBe('architecture.svg');
    expect(exportFileName('chart.svg', 'png')).toBe('chart.png');
    expect(exportFileName('notes', 'png')).toBe('notes.png');
    expect(exportFileName('.html', 'svg')).toBe('artifact.svg');
  });

  it('downloadBlobFile 触发锚点下载并在 1s 后释放 Blob URL', () => {
    vi.useFakeTimers();
    const { create, revoke } = stubObjectUrl();
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);

    downloadBlobFile(new Blob(['svg'], { type: 'image/svg+xml' }), 'chart.svg');
    expect(create).toHaveBeenCalledOnce();
    expect(click).toHaveBeenCalledOnce();
    expect(revoke).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1000);
    expect(revoke).toHaveBeenCalledWith('blob:artifact');
  });
});

describe('rasterizeSvg', () => {
  it('按 2 倍尺寸绘制白底并编码 PNG', async () => {
    const { revoke } = stubObjectUrl();
    class FakeImage {
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      set src(_value: string) {
        queueMicrotask(() => this.onload?.());
      }
    }
    vi.stubGlobal('Image', FakeImage);

    const drawImage = vi.fn();
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
      fillStyle: '',
      fillRect: vi.fn(),
      drawImage,
    } as unknown as CanvasRenderingContext2D);
    vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation((callback) => {
      callback(new Blob(['png'], { type: 'image/png' }));
    });

    const png = await rasterizeSvg({ svg: '<svg/>', width: 100, height: 50 }, 2);
    expect(png.type).toBe('image/png');
    expect(drawImage).toHaveBeenCalledWith(expect.any(Object), 0, 0, 200, 100);
    expect(revoke).toHaveBeenCalledWith('blob:artifact');
  });

  it('浏览器不支持 canvas 时抛错并释放 URL', async () => {
    const { revoke } = stubObjectUrl();
    class FakeImage {
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      set src(_value: string) {
        queueMicrotask(() => this.onload?.());
      }
    }
    vi.stubGlobal('Image', FakeImage);
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);

    await expect(rasterizeSvg({ svg: '<svg/>', width: 10, height: 10 })).rejects.toThrow(
      /canvas/,
    );
    expect(revoke).toHaveBeenCalledWith('blob:artifact');
  });
});
