import type { DiagramInput } from '../types';
import {
  DIAGRAM_COLORS,
  circleEl,
  lineEl,
  rectEl,
  textEl,
  truncate,
} from '../svg';
import type { Point, View } from './grid';

export function renderSequence(
  input: Extract<DiagramInput, { type: 'sequence' }>,
  view: View,
): string {
  const gap = (view.width - 160) / Math.max(1, input.actors.length - 1);
  const actorX = new Map(
    input.actors.map((actor, index) => [actor.id, 80 + gap * index] as const),
  );
  const lifelineTop = 130;
  const lifelineBottom = view.height - 60;
  const actors = input.actors
    .map((actor, index) => {
      const x = 80 + gap * index;
      return [
        rectEl(x - 60, 92, 120, 34, { rx: 6, fill: DIAGRAM_COLORS.panel }),
        textEl(x, 114, actor.label, { size: 12, weight: 600, anchor: 'middle', max: 14 }),
        lineEl(x, lifelineTop, x, lifelineBottom, {
          color: DIAGRAM_COLORS.grid,
          dash: '4 4',
        }),
      ].join('');
    })
    .join('');
  const messageGap =
    input.messages.length > 1
      ? (lifelineBottom - lifelineTop - 60) / (input.messages.length - 1)
      : 0;
  const messages = input.messages
    .map((message, index) => {
      const x1 = actorX.get(message.from);
      const x2 = actorX.get(message.to);
      if (x1 === undefined || x2 === undefined) return '';
      const y = lifelineTop + 40 + messageGap * index;
      const dashed = message.kind === 'return' ? '6 4' : undefined;
      return [
        lineEl(x1, y, x2, y, { arrow: true, dash: dashed, color: DIAGRAM_COLORS.ink }),
        textEl((x1 + x2) / 2, y - 8, message.label, {
          size: 11,
          color: DIAGRAM_COLORS.muted,
          anchor: 'middle',
          max: 24,
        }),
      ].join('');
    })
    .join('');
  return actors + messages;
}

export function renderEr(
  input: Extract<DiagramInput, { type: 'er' }>,
  view: View,
): string {
  const cols = input.entities.length > 1 ? 2 : 1;
  const cellWidth = (view.width - 120) / cols;
  const cellHeight = 230;
  const points = new Map<string, Point>();
  input.entities.forEach((entity, index) => {
    const row = Math.floor(index / cols);
    const col = index % cols;
    points.set(entity.id, {
      x: 60 + cellWidth * col + cellWidth / 2,
      y: 100 + cellHeight * row,
    });
  });
  const relations = input.relations
    .map((relation) => {
      const from = points.get(relation.from);
      const to = points.get(relation.to);
      if (!from || !to) return '';
      return [
        lineEl(from.x, from.y, to.x, to.y, { arrow: true }),
        textEl((from.x + to.x) / 2, (from.y + to.y) / 2 - 8, relation.label ?? '', {
          size: 10,
          color: DIAGRAM_COLORS.muted,
          anchor: 'middle',
          max: 18,
        }),
        relation.cardinality
          ? textEl((from.x + to.x) / 2, (from.y + to.y) / 2 + 12, relation.cardinality, {
              size: 10,
              color: DIAGRAM_COLORS.accent,
              anchor: 'middle',
              max: 12,
            })
          : '',
      ].join('');
    })
    .join('');
  const entities = input.entities
    .map((entity) => {
      const point = points.get(entity.id)!;
      const w = 300;
      const h = 54 + entity.fields.length * 22;
      const header = [
        rectEl(point.x - w / 2, point.y - 40, w, 34, {
          rx: 6,
          fill: DIAGRAM_COLORS.accentSoft,
          stroke: DIAGRAM_COLORS.accent,
        }),
        textEl(point.x - w / 2 + 12, point.y - 18, entity.name, {
          size: 13,
          weight: 600,
          max: 20,
        }),
      ].join('');
      const fields = entity.fields
        .map((field, index) => {
          const y = point.y + 8 + index * 22;
          return [
            textEl(point.x - w / 2 + 12, y, field.name, {
              size: 11,
              weight: field.key ? 600 : 400,
              max: 18,
            }),
            textEl(point.x + w / 2 - 12, y, field.type, {
              size: 10,
              color: DIAGRAM_COLORS.muted,
              anchor: 'end',
              max: 16,
            }),
          ].join('');
        })
        .join('');
      return [
        rectEl(point.x - w / 2, point.y - 40, w, h, {
          fill: DIAGRAM_COLORS.panel,
          stroke: DIAGRAM_COLORS.grid,
        }),
        header,
        fields,
      ].join('');
    })
    .join('');
  return relations + entities;
}

export function renderTimeline(
  input: Extract<DiagramInput, { type: 'timeline' }>,
  view: View,
): string {
  const y = view.height / 2 + 30;
  const startX = 80;
  const endX = view.width - 80;
  const step = (endX - startX) / Math.max(1, input.events.length - 1);
  const axis = lineEl(startX, y, endX, y, { color: DIAGRAM_COLORS.ink, width: 2 });
  const events = input.events
    .map((event, index) => {
      const x = startX + step * index;
      return [
        circleEl(x, y, 6, { fill: DIAGRAM_COLORS.accent, stroke: DIAGRAM_COLORS.accent }),
        textEl(x, y - 18, event.date, {
          size: 11,
          color: DIAGRAM_COLORS.muted,
          anchor: 'middle',
          max: 14,
        }),
        textEl(x, y + 26, event.label, {
          size: 12,
          weight: 600,
          anchor: 'middle',
          max: 14,
        }),
        event.description
          ? textEl(x, y + 44, truncate(event.description, 14), {
              size: 10,
              color: DIAGRAM_COLORS.muted,
              anchor: 'middle',
              max: 14,
            })
          : '',
      ].join('');
    })
    .join('');
  return axis + events;
}
