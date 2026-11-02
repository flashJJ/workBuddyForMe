import { z } from 'zod';

/** v2.18 M2：10 类结构化图表输入（模型给数据，模板负责布局/校验） */

export const DIAGRAM_TYPES = [
  'architecture',
  'flow',
  'sequence',
  'state',
  'er',
  'timeline',
  'quadrant',
  'swimlane',
  'bar',
  'line',
] as const;
export type DiagramType = (typeof DIAGRAM_TYPES)[number];

export const DIAGRAM_SIZES = ['doc-inline', 'slide', 'square'] as const;
export type DiagramSize = (typeof DIAGRAM_SIZES)[number];

const titleSchema = z.string().trim().min(1).max(80);
const sizeSchema = z.enum(DIAGRAM_SIZES).optional();
const idSchema = z.string().trim().min(1).max(40);
const labelSchema = z.string().trim().min(1).max(80);
const edgeLabelSchema = z.string().trim().max(40).optional();

const nodeSchema = z.object({ id: idSchema, label: labelSchema });
const edgeSchema = z.object({
  from: idSchema,
  to: idSchema,
  label: edgeLabelSchema,
});

const architectureSchema = z.object({
  type: z.literal('architecture'),
  title: titleSchema,
  size: sizeSchema,
  nodes: z.array(nodeSchema.extend({ group: z.string().trim().max(40).optional() })).min(1).max(20),
  edges: z.array(edgeSchema).max(40).default([]),
});

const flowSchema = z.object({
  type: z.literal('flow'),
  title: titleSchema,
  size: sizeSchema,
  nodes: z
    .array(
      nodeSchema.extend({
        shape: z.enum(['start', 'process', 'decision', 'end']).optional(),
      }),
    )
    .min(1)
    .max(20),
  edges: z.array(edgeSchema).max(40).default([]),
});

const sequenceSchema = z.object({
  type: z.literal('sequence'),
  title: titleSchema,
  size: sizeSchema,
  actors: z.array(nodeSchema).min(2).max(8),
  messages: z
    .array(
      z.object({
        from: idSchema,
        to: idSchema,
        label: z.string().trim().min(1).max(60),
        kind: z.enum(['sync', 'async', 'return']).optional(),
      }),
    )
    .min(1)
    .max(20),
});

const stateSchema = z.object({
  type: z.literal('state'),
  title: titleSchema,
  size: sizeSchema,
  states: z
    .array(
      nodeSchema.extend({
        initial: z.boolean().optional(),
        final: z.boolean().optional(),
      }),
    )
    .min(1)
    .max(16),
  transitions: z.array(edgeSchema).max(32).default([]),
});

const erSchema = z.object({
  type: z.literal('er'),
  title: titleSchema,
  size: sizeSchema,
  entities: z
    .array(
      z.object({
        id: idSchema,
        name: labelSchema,
        fields: z
          .array(
            z.object({
              name: z.string().trim().min(1).max(40),
              type: z.string().trim().min(1).max(30),
              key: z.boolean().optional(),
            }),
          )
          .min(1)
          .max(8),
      }),
    )
    .min(1)
    .max(6),
  relations: z
    .array(
      z.object({
        from: idSchema,
        to: idSchema,
        label: z.string().trim().max(40).optional(),
        cardinality: z.string().trim().max(12).optional(),
      }),
    )
    .max(12)
    .default([]),
});

const timelineSchema = z.object({
  type: z.literal('timeline'),
  title: titleSchema,
  size: sizeSchema,
  events: z
    .array(
      z.object({
        date: z.string().trim().min(1).max(40),
        label: labelSchema,
        description: z.string().trim().max(120).optional(),
      }),
    )
    .min(2)
    .max(12),
});

const quadrantSchema = z.object({
  type: z.literal('quadrant'),
  title: titleSchema,
  size: sizeSchema,
  xAxis: z.object({ low: z.string().trim().max(40), high: z.string().trim().max(40) }),
  yAxis: z.object({ low: z.string().trim().max(40), high: z.string().trim().max(40) }),
  points: z
    .array(
      z.object({
        label: labelSchema,
        x: z.number().finite(),
        y: z.number().finite(),
      }),
    )
    .min(1)
    .max(16),
});

const swimlaneSchema = z.object({
  type: z.literal('swimlane'),
  title: titleSchema,
  size: sizeSchema,
  lanes: z.array(nodeSchema).min(1).max(6),
  steps: z
    .array(
      z.object({
        id: idSchema,
        label: labelSchema,
        lane: idSchema,
      }),
    )
    .min(1)
    .max(20),
  edges: z.array(edgeSchema).max(40).default([]),
});

const barSchema = z.object({
  type: z.literal('bar'),
  title: titleSchema,
  size: sizeSchema,
  unit: z.string().trim().max(12).optional(),
  categories: z
    .array(z.object({ label: labelSchema, value: z.number().finite() }))
    .min(1)
    .max(12),
});

const lineSchema = z.object({
  type: z.literal('line'),
  title: titleSchema,
  size: sizeSchema,
  unit: z.string().trim().max(12).optional(),
  labels: z.array(z.string().trim().min(1).max(24)).min(2).max(12),
  series: z
    .array(
      z.object({
        name: z.string().trim().min(1).max(30),
        values: z.array(z.number().finite()).min(2).max(12),
      }),
    )
    .min(1)
    .max(4),
});

export const diagramInputSchema = z.discriminatedUnion('type', [
  architectureSchema,
  flowSchema,
  sequenceSchema,
  stateSchema,
  erSchema,
  timelineSchema,
  quadrantSchema,
  swimlaneSchema,
  barSchema,
  lineSchema,
]);
export type DiagramInput = z.infer<typeof diagramInputSchema>;

export interface RenderedDiagram {
  type: DiagramType;
  title: string;
  html: string;
  svg: string;
}
