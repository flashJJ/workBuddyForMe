import { z } from 'zod';

/** v2.15 M4：工作流版本差异（节点 / 边 / config 顶层键） */
export const flowGraphDiffSchema = z.object({
  from: z.number().int().positive(),
  to: z.number().int().positive(),
  nodes: z.object({
    added: z.array(z.object({ id: z.string(), type: z.string() })),
    removed: z.array(z.object({ id: z.string(), type: z.string() })),
    typeChanged: z.array(z.object({ id: z.string(), fromType: z.string(), toType: z.string() })),
    configChanged: z.array(z.object({ id: z.string(), type: z.string(), keys: z.array(z.string()) })),
  }),
  edges: z.object({
    added: z.array(z.object({ source: z.string(), target: z.string(), handle: z.string().nullable() })),
    removed: z.array(z.object({ source: z.string(), target: z.string(), handle: z.string().nullable() })),
  }),
  summary: z.object({
    nodesAdded: z.number().int().nonnegative(),
    nodesRemoved: z.number().int().nonnegative(),
    nodesTypeChanged: z.number().int().nonnegative(),
    nodesConfigChanged: z.number().int().nonnegative(),
    edgesAdded: z.number().int().nonnegative(),
    edgesRemoved: z.number().int().nonnegative(),
  }),
});
export type FlowGraphDiff = z.infer<typeof flowGraphDiffSchema>;

export const flowVersionCompareQuerySchema = z.object({
  from: z.coerce.number().int().positive(),
  to: z.coerce.number().int().positive(),
});
export type FlowVersionCompareQuery = z.infer<typeof flowVersionCompareQuerySchema>;
