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
  'accent',
  'active',
  'destructive',
  'muted-foreground',
]);

const SVG_NS = 'http://www.w3.org/2000/svg';

export interface TrailNodes {
  group: SVGGElement;
  path: SVGPathElement;
  glowWide: SVGPathElement;
  glowNear: SVGPathElement;
  gradient: SVGLinearGradientElement;
  halo: SVGCircleElement;
  head: SVGCircleElement;
  sourceRing: SVGCircleElement;
  landingRing: SVGCircleElement;
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

function gradientId(id: string): string {
  return `light-gradient-${id.replace(/[^a-zA-Z0-9_-]/g, '-')}`;
}

export function createTrail(svg: SVGSVGElement, id: string, colorToken: string): TrailNodes {
  const color = lightColor(colorToken);
  const group = document.createElementNS(SVG_NS, 'g');
  group.setAttribute('data-light-id', id);
  group.style.pointerEvents = 'none';

  const gradient = document.createElementNS(SVG_NS, 'linearGradient');
  gradient.setAttribute('id', gradientId(id));
  gradient.setAttribute('gradientUnits', 'userSpaceOnUse');
  const fade = document.createElementNS(SVG_NS, 'stop');
  fade.setAttribute('offset', '0');
  fade.setAttribute('stop-color', color);
  fade.setAttribute('stop-opacity', '0');
  const solid = document.createElementNS(SVG_NS, 'stop');
  solid.setAttribute('offset', '1');
  solid.setAttribute('stop-color', color);
  gradient.append(fade, solid);

  // 宽窄两层柔光：加宽透明度低的描边，近似 Lancer 的 glow 尾迹。
  const glowWide = document.createElementNS(SVG_NS, 'path');
  glowWide.setAttribute('fill', 'none');
  glowWide.setAttribute('stroke', color);
  glowWide.setAttribute('stroke-width', '6');
  glowWide.setAttribute('stroke-linecap', 'round');
  glowWide.setAttribute('opacity', '0.07');

  const glowNear = document.createElementNS(SVG_NS, 'path');
  glowNear.setAttribute('fill', 'none');
  glowNear.setAttribute('stroke', color);
  glowNear.setAttribute('stroke-width', '2.6');
  glowNear.setAttribute('stroke-linecap', 'round');
  glowNear.setAttribute('opacity', '0.13');

  const path = document.createElementNS(SVG_NS, 'path');
  path.setAttribute('fill', 'none');
  path.setAttribute('stroke', `url(#${gradientId(id)})`);
  path.setAttribute('stroke-width', '1.6');
  path.setAttribute('stroke-linecap', 'round');

  const halo = document.createElementNS(SVG_NS, 'circle');
  halo.setAttribute('r', '6');
  halo.setAttribute('fill', color);
  halo.setAttribute('opacity', '0.18');

  const head = document.createElementNS(SVG_NS, 'circle');
  head.setAttribute('r', '2.4');
  head.setAttribute('fill', color);

  const sourceRing = document.createElementNS(SVG_NS, 'circle');
  sourceRing.setAttribute('fill', 'none');
  sourceRing.setAttribute('stroke', color);
  sourceRing.setAttribute('stroke-width', '2');
  sourceRing.setAttribute('opacity', '0');

  const landingRing = document.createElementNS(SVG_NS, 'circle');
  landingRing.setAttribute('fill', 'none');
  landingRing.setAttribute('stroke', color);
  landingRing.setAttribute('stroke-width', '1.5');
  landingRing.setAttribute('opacity', '0');

  group.append(gradient, glowWide, glowNear, path, halo, head, sourceRing, landingRing);
  svg.appendChild(group);
  return { group, path, glowWide, glowNear, gradient, halo, head, sourceRing, landingRing };
}

function setGradient(gradient: SVGLinearGradientElement, curve: CubicCurve): void {
  gradient.setAttribute('x1', curve.from.x.toFixed(2));
  gradient.setAttribute('y1', curve.from.y.toFixed(2));
  gradient.setAttribute('x2', curve.to.x.toFixed(2));
  gradient.setAttribute('y2', curve.to.y.toFixed(2));
}

/** 按缓动后的进度 t∈[0,1] 更新渐变尾迹、柔光、发射环与落点环。 */
export function updateTrail(nodes: TrailNodes, curve: CubicCurve, progress: number): void {
  const t = Math.min(1, Math.max(0, progress));
  const head = pointOnCurve(curve, t);
  const tailStart = Math.max(0, t - 0.28);
  const d = segmentPath(curve, tailStart, t);

  nodes.path.setAttribute('d', d);
  nodes.glowWide.setAttribute('d', d);
  nodes.glowNear.setAttribute('d', d);
  setGradient(nodes.gradient, curve);
  nodes.head.setAttribute('cx', head.x.toFixed(2));
  nodes.head.setAttribute('cy', head.y.toFixed(2));
  nodes.halo.setAttribute('cx', head.x.toFixed(2));
  nodes.halo.setAttribute('cy', head.y.toFixed(2));

  const launch = Math.min(1, t / 0.35);
  const start = pointOnCurve(curve, 0);
  nodes.sourceRing.setAttribute('cx', start.x.toFixed(2));
  nodes.sourceRing.setAttribute('cy', start.y.toFixed(2));
  nodes.sourceRing.setAttribute('r', (10 + launch * 8).toFixed(2));
  nodes.sourceRing.setAttribute('opacity', ((1 - launch) * 0.6).toFixed(3));

  if (t > 0.82) {
    const landing = (t - 0.82) / 0.18;
    nodes.landingRing.setAttribute('cx', curve.to.x.toFixed(2));
    nodes.landingRing.setAttribute('cy', curve.to.y.toFixed(2));
    nodes.landingRing.setAttribute('r', (2 + landing * 10).toFixed(2));
    nodes.landingRing.setAttribute('opacity', ((1 - landing) * 0.7).toFixed(3));
  } else {
    nodes.landingRing.setAttribute('opacity', '0');
  }

  nodes.group.setAttribute('opacity', t > 0.92 ? String(Math.max(0, (1 - t) / 0.08)) : '1');
}

/** 初始化时给一条极短的起点尾迹，避免首帧空 path */
export function seedTrail(nodes: TrailNodes, curve: CubicCurve): void {
  const d = segmentPath(curve, 0, 0.02);
  nodes.path.setAttribute('d', d);
  nodes.glowWide.setAttribute('d', d);
  nodes.glowNear.setAttribute('d', d);
  setGradient(nodes.gradient, curve);
  const head = pointOnCurve(curve, 0);
  nodes.head.setAttribute('cx', head.x.toFixed(2));
  nodes.head.setAttribute('cy', head.y.toFixed(2));
  nodes.halo.setAttribute('cx', head.x.toFixed(2));
  nodes.halo.setAttribute('cy', head.y.toFixed(2));
  nodes.sourceRing.setAttribute('cx', head.x.toFixed(2));
  nodes.sourceRing.setAttribute('cy', head.y.toFixed(2));
  nodes.sourceRing.setAttribute('r', '10');
  nodes.sourceRing.setAttribute('opacity', '0.6');
  nodes.landingRing.setAttribute('opacity', '0');
  nodes.group.setAttribute('opacity', '1');
}

export function removeTrail(nodes: TrailNodes): void {
  nodes.group.remove();
}
