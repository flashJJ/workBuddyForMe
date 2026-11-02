import type { DiagramInput } from '../types';
import {
  DIAGRAM_COLORS,
  lineEl,
  rectEl,
  textEl,
} from '../svg';

type View = { width: number; height: number };

export function renderQuadrant(
  input: Extract<DiagramInput, { type: 'quadrant' }>,
  view: View,
): string {
  const left = 90;
  const right = view.width - 70;
  const top = 100;
  const bottom = view.height - 80;
  const midX = (left + right) / 2;
  const midY = (top + bottom) / 2;
  const xs = input.points.map((point) => point.x);
  const ys = input.points.map((point) => point.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const scaleX = (value: number): number =>
    maxX === minX ? midX : left + ((value - minX) / (maxX - minX)) * (right - left);
  const scaleY = (value: number): number =>
    maxY === minY ? midY : bottom - ((value - minY) / (maxY - minY)) * (bottom - top);

  const frame = [
    rectEl(left, top, right - left, bottom - top, {
      fill: DIAGRAM_COLORS.panel,
      stroke: DIAGRAM_COLORS.grid,
    }),
    lineEl(midX, top, midX, bottom, { color: DIAGRAM_COLORS.grid, width: 2 }),
    lineEl(left, midY, right, midY, { color: DIAGRAM_COLORS.grid, width: 2 }),
    textEl(left + 8, top + 20, '高 ' + input.yAxis.high, {
      size: 10,
      color: DIAGRAM_COLORS.muted,
    }),
    textEl(left + 8, bottom - 8, '低 ' + input.yAxis.low, {
      size: 10,
      color: DIAGRAM_COLORS.muted,
    }),
    textEl(right - 8, bottom - 8, input.xAxis.high + ' 高', {
      size: 10,
      color: DIAGRAM_COLORS.muted,
      anchor: 'end',
    }),
    textEl(left + 8, midY - 8, input.xAxis.low, {
      size: 10,
      color: DIAGRAM_COLORS.muted,
    }),
  ].join('');

  const points = input.points
    .map((point) => {
      const x = scaleX(point.x);
      const y = scaleY(point.y);
      return [
        `<circle cx="${x}" cy="${y}" r="4" fill="${DIAGRAM_COLORS.accent}"/>`,
        textEl(x + 8, y + 4, point.label, {
          size: 10,
          color: DIAGRAM_COLORS.ink,
          max: 16,
        }),
      ].join('');
    })
    .join('');
  return frame + points;
}

export function renderSwimlane(
  input: Extract<DiagramInput, { type: 'swimlane' }>,
  view: View,
): string {
  const left = 130;
  const right = view.width - 50;
  const top = 100;
  const laneHeight = (view.height - top - 50) / input.lanes.length;
  const laneY = new Map(
    input.lanes.map((lane, index) => [lane.id, top + laneHeight * index] as const),
  );

  const lanes = input.lanes
    .map((lane, index) => {
      const y = top + laneHeight * index;
      return [
        rectEl(60, y, right - 60, laneHeight - 8, {
          fill: index % 2 === 0 ? DIAGRAM_COLORS.panel : '#fbfaf8',
          stroke: DIAGRAM_COLORS.grid,
        }),
        textEl(70, y + laneHeight / 2, lane.label, {
          size: 12,
          weight: 600,
          max: 10,
        }),
      ].join('');
    })
    .join('');

  const stepGap = (right - left) / Math.max(1, input.steps.length - 1);
  const stepPoints = new Map<string, { x: number; y: number }>();
  input.steps.forEach((step, index) => {
    const y = laneY.get(step.lane);
    if (y === undefined) return;
    stepPoints.set(step.id, {
      x: left + stepGap * index,
      y: y + laneHeight / 2,
    });
  });

  const edges = input.edges
    .map((edge) => {
      const from = stepPoints.get(edge.from);
      const to = stepPoints.get(edge.to);
      if (!from || !to) return '';
      return lineEl(from.x, from.y, to.x, to.y, { arrow: true });
    })
    .join('');

  const steps = input.steps
    .map((step) => {
      const point = stepPoints.get(step.id);
      if (!point) return '';
      const width = 130;
      const height = 40;
      return [
        rectEl(point.x - width / 2, point.y - height / 2, width, height, {
          rx: 6,
          fill: DIAGRAM_COLORS.panel,
          stroke: DIAGRAM_COLORS.grid,
        }),
        textEl(point.x, point.y + 4, step.label, {
          size: 11,
          weight: 600,
          anchor: 'middle',
          max: 14,
        }),
      ].join('');
    })
    .join('');
  return lanes + edges + steps;
}
