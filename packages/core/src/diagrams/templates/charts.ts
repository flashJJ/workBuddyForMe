import type { DiagramInput } from '../types';
import {
  DIAGRAM_COLORS,
  lineEl,
  polylineEl,
  rectEl,
  textEl,
} from '../svg';

type View = { width: number; height: number };

function valueRange(values: number[]): { min: number; max: number } {
  const min = Math.min(0, ...values);
  const max = Math.max(...values);
  return min === max ? { min: 0, max: max === 0 ? 1 : max } : { min, max };
}

export function renderBar(
  input: Extract<DiagramInput, { type: 'bar' }>,
  view: View,
): string {
  const left = 80;
  const right = view.width - 40;
  const top = 110;
  const bottom = view.height - 80;
  const plotWidth = right - left;
  const plotHeight = bottom - top;
  const { min, max } = valueRange(input.categories.map((category) => category.value));
  const zeroY = bottom - ((0 - min) / (max - min)) * plotHeight;
  const barGap = plotWidth / input.categories.length;
  const barWidth = Math.min(64, barGap * 0.56);

  const axes = [
    lineEl(left, top, left, bottom, { color: DIAGRAM_COLORS.grid }),
    lineEl(left, zeroY, right, zeroY, { color: DIAGRAM_COLORS.ink, width: 1.5 }),
  ].join('');

  const bars = input.categories
    .map((category, index) => {
      const centerX = left + barGap * index + barGap / 2;
      const valueY = bottom - ((category.value - min) / (max - min)) * plotHeight;
      const y = Math.min(valueY, zeroY);
      const height = Math.abs(zeroY - valueY);
      return [
        rectEl(centerX - barWidth / 2, y, barWidth, Math.max(2, height), {
          rx: 4,
          fill: index === 0 ? DIAGRAM_COLORS.accent : DIAGRAM_COLORS.series[index % 4]!,
          stroke: 'none',
        }),
        textEl(centerX, y - 8, `${category.value}${input.unit ?? ''}`, {
          size: 10,
          weight: 600,
          anchor: 'middle',
          max: 12,
        }),
        textEl(centerX, bottom + 18, category.label, {
          size: 10,
          color: DIAGRAM_COLORS.muted,
          anchor: 'middle',
          max: 12,
        }),
      ].join('');
    })
    .join('');

  return axes + bars;
}

export function renderLine(
  input: Extract<DiagramInput, { type: 'line' }>,
  view: View,
): string {
  const left = 80;
  const right = view.width - 50;
  const top = 110;
  const bottom = view.height - 90;
  const plotWidth = right - left;
  const plotHeight = bottom - top;
  const allValues = input.series.flatMap((series) => series.values);
  const { min, max } = valueRange(allValues);
  const xAt = (index: number): number =>
    left + (index / Math.max(1, input.labels.length - 1)) * plotWidth;
  const yAt = (value: number): number =>
    bottom - ((value - min) / (max - min)) * plotHeight;

  const axes = [
    lineEl(left, top, left, bottom, { color: DIAGRAM_COLORS.grid }),
    lineEl(left, bottom, right, bottom, { color: DIAGRAM_COLORS.ink, width: 1.5 }),
    textEl(left - 8, yAt(max) + 4, `${max}${input.unit ?? ''}`, {
      size: 10,
      color: DIAGRAM_COLORS.muted,
      anchor: 'end',
    }),
    textEl(left - 8, yAt(min) + 4, `${min}${input.unit ?? ''}`, {
      size: 10,
      color: DIAGRAM_COLORS.muted,
      anchor: 'end',
    }),
    ...input.labels.map((label, index) =>
      textEl(xAt(index), bottom + 18, label, {
        size: 10,
        color: DIAGRAM_COLORS.muted,
        anchor: 'middle',
        max: 10,
      }),
    ),
  ].join('');

  const series = input.series
    .map((item, seriesIndex) => {
      const color = DIAGRAM_COLORS.series[seriesIndex % 4]!;
      const points = item.values.map((value, index) => [xAt(index), yAt(value)] as [number, number]);
      const dots = points
        .map(([x, y]) => `<circle cx="${x}" cy="${y}" r="3" fill="${color}"/>`)
        .join('');
      return polylineEl(points, color, 2) + dots;
    })
    .join('');

  const legend = input.series
    .map((item, index) => {
      const x = left + index * 150;
      return [
        rectEl(x, top - 28, 10, 10, {
          rx: 2,
          fill: DIAGRAM_COLORS.series[index % 4]!,
          stroke: 'none',
        }),
        textEl(x + 16, top - 18, item.name, {
          size: 10,
          color: DIAGRAM_COLORS.muted,
          max: 12,
        }),
      ].join('');
    })
    .join('');

  return axes + series + legend;
}
