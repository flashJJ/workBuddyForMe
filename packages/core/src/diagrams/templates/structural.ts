import type { DiagramInput } from '../types';
import { DIAGRAM_COLORS, circleEl, lineEl, rectEl, textEl } from '../svg';
import { positionsOf, type Point, type View } from './grid';

function edgeLines(
  edges: Array<{ from: string; to: string; label?: string }>,
  points: Map<string, Point>,
): string {
  return edges
    .map((edge) => {
      const from = points.get(edge.from);
      const to = points.get(edge.to);
      if (!from || !to) return '';
      const label = edge.label
        ? textEl((from.x + to.x) / 2, (from.y + to.y) / 2 - 8, edge.label, {
            size: 11,
            color: DIAGRAM_COLORS.muted,
            anchor: 'middle',
            max: 20,
          })
        : '';
      return lineEl(from.x, from.y, to.x, to.y, { arrow: true }) + label;
    })
    .join('');
}

export function renderArchitecture(
  input: Extract<DiagramInput, { type: 'architecture' }>,
  view: View,
): string {
  const points = positionsOf(
    input.nodes.map((node) => node.id),
    view,
    { cols: 3, cellHeight: 120 },
  );
  const edges = edgeLines(input.edges, points);
  const nodes = input.nodes
    .map((node) => {
      const point = points.get(node.id)!;
      const w = 190;
      const h = 62;
      return [
        rectEl(point.x - w / 2, point.y - h / 2, w, h, {
          fill: DIAGRAM_COLORS.panel,
          stroke: DIAGRAM_COLORS.grid,
        }),
        textEl(point.x, point.y - 4, node.label, {
          size: 13,
          weight: 600,
          anchor: 'middle',
          max: 18,
        }),
        node.group
          ? textEl(point.x, point.y + 16, node.group, {
              size: 10,
              color: DIAGRAM_COLORS.muted,
              anchor: 'middle',
              max: 20,
            })
          : '',
      ].join('');
    })
    .join('');
  return edges + nodes;
}

export function renderFlow(
  input: Extract<DiagramInput, { type: 'flow' }>,
  view: View,
): string {
  const points = positionsOf(
    input.nodes.map((node) => node.id),
    view,
    { cols: 3, cellHeight: 130 },
  );
  const edges = edgeLines(input.edges, points);
  const nodes = input.nodes
    .map((node) => {
      const point = points.get(node.id)!;
      const shape = node.shape ?? 'process';
      if (shape === 'decision') {
        const half = 58;
        return [
          `<polygon points="${point.x},${point.y - half} ${point.x + half},${point.y} ${point.x},${point.y + half} ${point.x - half},${point.y}" fill="${DIAGRAM_COLORS.accentSoft}" stroke="${DIAGRAM_COLORS.accent}" stroke-width="1"/>`,
          textEl(point.x, point.y + 4, node.label, {
            size: 12,
            weight: 600,
            anchor: 'middle',
            max: 12,
          }),
        ].join('');
      }
      const w = shape === 'start' || shape === 'end' ? 150 : 180;
      const h = 52;
      return [
        rectEl(point.x - w / 2, point.y - h / 2, w, h, {
          rx: shape === 'start' || shape === 'end' ? 26 : 8,
          fill: shape === 'start' || shape === 'end' ? DIAGRAM_COLORS.accentSoft : DIAGRAM_COLORS.panel,
          stroke: shape === 'start' || shape === 'end' ? DIAGRAM_COLORS.accent : DIAGRAM_COLORS.grid,
        }),
        textEl(point.x, point.y + 4, node.label, {
          size: 12,
          weight: 600,
          anchor: 'middle',
          max: 18,
        }),
      ].join('');
    })
    .join('');
  return edges + nodes;
}

export function renderState(
  input: Extract<DiagramInput, { type: 'state' }>,
  view: View,
): string {
  const points = positionsOf(
    input.states.map((state) => state.id),
    view,
    { cols: 3, cellHeight: 130 },
  );
  const edges = edgeLines(input.transitions, points);
  const states = input.states
    .map((state) => {
      const point = points.get(state.id)!;
      const w = 170;
      const h = 52;
      const decorations = [
        state.initial
          ? circleEl(point.x - w / 2 - 16, point.y, 6, {
              fill: DIAGRAM_COLORS.ink,
              stroke: DIAGRAM_COLORS.ink,
            })
          : '',
        state.final
          ? circleEl(point.x + w / 2 + 14, point.y, 7, {
              fill: DIAGRAM_COLORS.panel,
              stroke: DIAGRAM_COLORS.ink,
              strokeWidth: 2,
            })
          : '',
      ].join('');
      return [
        rectEl(point.x - w / 2, point.y - h / 2, w, h, {
          rx: 24,
          fill: DIAGRAM_COLORS.panel,
          stroke: DIAGRAM_COLORS.grid,
        }),
        textEl(point.x, point.y + 4, state.label, {
          size: 12,
          weight: 600,
          anchor: 'middle',
          max: 16,
        }),
        decorations,
      ].join('');
    })
    .join('');
  return edges + states;
}
