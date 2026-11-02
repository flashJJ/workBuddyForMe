import type { ArtifactFormat } from '@wbfm/shared/constants';

/**
 * v2.18 M3：产物 SVG/PNG 导出（Web 与桌面共用）。
 * 仅支持图表产物：HTML 提取内联 SVG，SVG 直接使用；Markdown/无 SVG 的通用 HTML 不承诺导出。
 * 全部在客户端完成，不引入服务端 Chromium / resvg。
 */

export interface ArtifactSvg {
  /** 补齐命名空间与尺寸后的 SVG 文本 */
  svg: string;
  width: number;
  height: number;
}

const SVG_NS = 'http://www.w3.org/2000/svg';
const PNG_BACKGROUND = '#ffffff';

function parseLength(value: string | null): number | null {
  const parsed = Number((value ?? '').trim());
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function parseViewBox(value: string | null): { width: number; height: number } | null {
  const parts = (value ?? '').trim().split(/[\s,]+/).map(Number);
  if (parts.length !== 4 || parts.some((item) => !Number.isFinite(item))) return null;
  const width = parts[2]!;
  const height = parts[3]!;
  return width > 0 && height > 0 ? { width, height } : null;
}

/** 规范化根节点：补 xmlns 与明确的 width/height，避免导出的 SVG 离线打开时缺尺寸 */
function normalizeSvg(element: Element): ArtifactSvg | null {
  if (!element.getAttribute('xmlns')) element.setAttribute('xmlns', SVG_NS);
  const viewBox = parseViewBox(element.getAttribute('viewBox'));
  const width = parseLength(element.getAttribute('width')) ?? viewBox?.width;
  const height = parseLength(element.getAttribute('height')) ?? viewBox?.height;
  if (!width || !height) return null;
  element.setAttribute('width', String(width));
  element.setAttribute('height', String(height));
  return { svg: new XMLSerializer().serializeToString(element), width, height };
}

/** 从产物文本提取可导出的 SVG；md / 非图表 HTML / 解析失败均返回 null */
export function extractArtifactSvg(source: string, format: ArtifactFormat): ArtifactSvg | null {
  if (!source.trim()) return null;
  if (format === 'svg') {
    const document = new DOMParser().parseFromString(source, 'image/svg+xml');
    const root = document.documentElement;
    return root && root.localName === 'svg' ? normalizeSvg(root) : null;
  }
  if (format === 'html') {
    const svg = new DOMParser().parseFromString(source, 'text/html').querySelector('svg');
    return svg ? normalizeSvg(svg) : null;
  }
  return null;
}

/** 导出的文件名：去掉原扩展名后换成目标格式 */
export function exportFileName(filename: string, extension: 'svg' | 'png'): string {
  const base = filename.replace(/\.[^.]+$/, '').trim();
  return `${base || 'artifact'}.${extension}`;
}

/** 与 downloadApiFile 一致：Blob URL + 隐藏锚点，避免桌面端导航丢令牌 */
export function downloadBlobFile(blob: Blob, filename: string): void {
  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = objectUrl;
  anchor.download = filename;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
}

function loadImage(source: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('SVG 解码失败'));
    image.src = source;
  });
}

/** Canvas 栅格化：白底、默认 2 倍图，保证进入 PPT/文档后不糊 */
export async function rasterizeSvg(
  artifact: ArtifactSvg,
  scale = 2,
): Promise<Blob> {
  await document.fonts?.ready;
  const objectUrl = URL.createObjectURL(
    new Blob([artifact.svg], { type: 'image/svg+xml;charset=utf-8' }),
  );
  try {
    const image = await loadImage(objectUrl);
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(artifact.width * scale));
    canvas.height = Math.max(1, Math.round(artifact.height * scale));
    const context = canvas.getContext('2d');
    if (!context) throw new Error('浏览器不支持 canvas');
    context.fillStyle = PNG_BACKGROUND;
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
    if (!blob) throw new Error('PNG 编码失败');
    return blob;
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}
