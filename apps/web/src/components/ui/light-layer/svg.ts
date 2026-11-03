/**
 * v2.20 M3 Light UI SVG：只负责创建/更新 path 与光圈，不依赖 React。
 * 颜色只接受语义 token，运行时拼成 hsl(var(--token))，不写死十六进制。
 */
import { type CubicCurve, pointOnCurve, segmentPath } from './geometry';

const COLOR_TOKENS = new Set([
  'primary',
  'info',
  'success',
  'warning',
  'active',
  'destructive',
  'muted-foreground',
]);

const SVG_NS = 'http://www.w3.org/2000/svg';

export interface TrailNodes {
  group: SVGGElement;
  path: SVGPathElement;
  halo: SVGCircleElement;
  head: SVGCircleElement;
}

export function lightColor(token: string | undefined): string {
  const safe = token && COLOR_TOKENS.has(token) ? token : 'primary';
  return `hsl(var(--${safe}))`;
}

export function createLayerSvg(root: HTMLElement): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('data-testid', 'light-layer');
  svg.classList.add('light-layer-svg');
  const fixed = root === document.body;
  svg.style.position = fixed ? 'fixed' : 'absolute';
  svg.style.inset = '0';
  svg.style.width = '100%';
  svg.style.height = '100%';
  svg.style.pointerEvents = 'none';
  svg.style.overflow = 'visible';
  svg.style.zIndex = '60';
  root.appendChild(svg);
  return svg;
}

export function createTrail(svg: SVGSVGElement, id: string, colorToken: string): TrailNodes {
  const color = lightColor(colorToken);
  const group = document.createElementNS(SVG_NS, 'g');
  group.setAttribute('data-light-id', id);
  group.style.pointerEvents = 'none';

  const path = document.createElementNS(SVG_NS, 'path');
  path.setAttribute('fill', 'none');
  path.setAttribute('stroke', color);
  path.setAttribute('stroke-width', '1.6');
  path.setAttribute('stroke-linecap', 'round');
  path.setAttribute('opacity', '0.9');

  const halo = document.createElementNS(SVG_NS, 'circle');
  halo.setAttribute('r', '6');
  halo.setAttribute('fill', color);
  halo.setAttribute('opacity', '0.18');

  const head = document.createElementNS(SVG_NS, 'circle');
  head.setAttribute('r', '2.4');
  head.setAttribute('fill', color);

  group.append(path, halo, head);
  svg.appendChild(group);
  return { group, path, halo, head };
}

/** 按缓动后的进度 t∈[0,1] 更新尾迹与光点；末段整体淡出 */
export function updateTrail(nodes: TrailNodes, curve: CubicCurve, progress: number): void {
  const t = Math.min(1, Math.max(0, progress));
  const head = pointOnCurve(curve, t);
  const tailStart = Math.max(0, t - 0.16);

  nodes.path.setAttribute('d', segmentPath(curve, tailStart, t));
  nodes.head.setAttribute('cx', head.x.toFixed(2));
  nodes.head.setAttribute('cy', head.y.toFixed(2));
  nodes.halo.setAttribute('cx', head.x.toFixed(2));
  nodes.halo.setAttribute('cy', head.y.toFixed(2));
  nodes.group.setAttribute('opacity', t > 0.82 ? String(Math.max(0, (1 - t) / 0.18)) : '1');
}

/** 初始化时给一条极短的起点尾迹，避免首帧空 path */
export function seedTrail(nodes: TrailNodes, curve: CubicCurve): void {
  nodes.path.setAttribute('d', segmentPath(curve, 0, 0.02));
  const head = pointOnCurve(curve, 0);
  nodes.head.setAttribute('cx', head.x.toFixed(2));
  nodes.head.setAttribute('cy', head.y.toFixed(2));
  nodes.halo.setAttribute('cx', head.x.toFixed(2));
  nodes.halo.setAttribute('cy', head.y.toFixed(2));
  nodes.group.setAttribute('opacity', '1');
}

export function removeTrail(nodes: TrailNodes): void {
  nodes.group.remove();
}
