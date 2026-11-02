import type { DiagramSize } from './types';

/** v2.18 M2：最小 SVG 构造器（不引入图表库；所有样式内联，便于导出） */

export const DIAGRAM_COLORS = {
  paper: '#f8f7f4',
  ink: '#1f2937',
  muted: '#6b7280',
  line: '#9ca3af',
  accent: '#bf4520',
  accentSoft: '#f3d7cc',
  panel: '#ffffff',
  grid: '#e5e7eb',
  series: ['#bf4520', '#1f6f78', '#6b4c9a', '#b07d1a'],
} as const;

export const DIAGRAM_FONT =
  '-apple-system, BlinkMacSystemFont, "Segoe UI", "Microsoft YaHei", "PingFang SC", sans-serif';

export const VIEW_BOX: Record<DiagramSize, { width: number; height: number }> = {
  'doc-inline': { width: 960, height: 600 },
  slide: { width: 1280, height: 720 },
  square: { width: 1080, height: 1080 },
};

export function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export function truncate(value: string, max: number): string {
  return value.length > max ? `${value.slice(0, max - 1)}…` : value;
}

export function textEl(
  x: number,
  y: number,
  value: string,
  options: {
    size?: number;
    color?: string;
    weight?: number;
    anchor?: 'start' | 'middle' | 'end';
    max?: number;
  } = {},
): string {
  const size = options.size ?? 14;
  const color = options.color ?? DIAGRAM_COLORS.ink;
  const weight = options.weight ?? 400;
  const anchor = options.anchor ?? 'start';
  const text = escapeXml(truncate(value, options.max ?? 48));
  return `<text x="${x}" y="${y}" font-size="${size}" font-weight="${weight}" fill="${color}" text-anchor="${anchor}">${text}</text>`;
}

export function rectEl(
  x: number,
  y: number,
  width: number,
  height: number,
  options: {
    rx?: number;
    fill?: string;
    stroke?: string;
    strokeWidth?: number;
    dash?: string;
  } = {},
): string {
  const rx = options.rx ?? 8;
  const fill = options.fill ?? DIAGRAM_COLORS.panel;
  const stroke = options.stroke ?? DIAGRAM_COLORS.grid;
  const strokeWidth = options.strokeWidth ?? 1;
  const dash = options.dash ? ` stroke-dasharray="${options.dash}"` : '';
  return `<rect x="${x}" y="${y}" width="${width}" height="${height}" rx="${rx}" fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}"${dash}/>`;
}

export function circleEl(
  cx: number,
  cy: number,
  r: number,
  options: { fill?: string; stroke?: string; strokeWidth?: number } = {},
): string {
  return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${options.fill ?? DIAGRAM_COLORS.accent}" stroke="${options.stroke ?? 'none'}" stroke-width="${options.strokeWidth ?? 1}"/>`;
}

export function lineEl(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  options: {
    color?: string;
    width?: number;
    dash?: string;
    arrow?: boolean;
    opacity?: number;
  } = {},
): string {
  const color = options.color ?? DIAGRAM_COLORS.line;
  const width = options.width ?? 1.5;
  const dash = options.dash ? ` stroke-dasharray="${options.dash}"` : '';
  const marker = options.arrow ? ' marker-end="url(#arrow)"' : '';
  const opacity = options.opacity !== undefined ? ` opacity="${options.opacity}"` : '';
  return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${color}" stroke-width="${width}"${dash}${marker}${opacity}/>`;
}

export function polylineEl(points: Array<[number, number]>, color: string, width = 2): string {
  const path = points.map(([x, y]) => `${x},${y}`).join(' ');
  return `<polyline points="${path}" fill="none" stroke="${color}" stroke-width="${width}" stroke-linejoin="round"/>`;
}

export function arrowDefs(): string {
  return `<defs><marker id="arrow" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto"><path d="M0,0 L8,4 L0,8 z" fill="${DIAGRAM_COLORS.line}"/></marker></defs>`;
}

export function wrapSvg(
  title: string,
  viewBox: { width: number; height: number },
  inner: string,
): string {
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${viewBox.width} ${viewBox.height}" width="${viewBox.width}" height="${viewBox.height}" font-family="${DIAGRAM_FONT}">`,
    arrowDefs(),
    `<rect x="0" y="0" width="${viewBox.width}" height="${viewBox.height}" fill="${DIAGRAM_COLORS.paper}"/>`,
    textEl(viewBox.width / 2, 48, title, {
      size: 22,
      weight: 600,
      anchor: 'middle',
      max: 46,
    }),
    inner,
    `</svg>`,
  ].join('');
}

export function wrapHtml(title: string, svg: string): string {
  return [
    '<!doctype html>',
    '<html lang="zh-CN">',
    '<head><meta charset="utf-8">',
    `<title>${escapeXml(title)}</title>`,
    `<style>html,body{margin:0;background:${DIAGRAM_COLORS.paper};font-family:${DIAGRAM_FONT};}main{max-width:100%;padding:0;}svg{display:block;max-width:100%;height:auto;}</style>`,
    '</head><body><main>',
    svg,
    '</main></body></html>',
  ].join('');
}
