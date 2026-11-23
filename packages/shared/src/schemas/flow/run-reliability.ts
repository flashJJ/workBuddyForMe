import { z } from 'zod';

/**
 * v5.0 运行兜底契约：
 * - 补偿上限/退避；
 * - 批量重放/清理/保留；
 * - Webhook 鉴权模式；
 * - canonical JSON（图快照哈希用）。
 */

export const FLOW_BATCH_REPLAY_LIMIT = 20;
export const FLOW_COMPENSATION_MAX_ATTEMPTS = 3;
export const FLOW_COMPENSATION_BACKOFF_MS = [30_000, 120_000, 600_000] as const;
export const FLOW_RUN_RETENTION_DEFAULTS = {
  enabled: true,
  successDays: 30,
  failureDays: 90,
  maxPerWorkflow: 500,
} as const;

export const flowRunBatchReplaySchema = z.object({
  runIds: z.array(z.string().trim().min(1)).min(1).max(FLOW_BATCH_REPLAY_LIMIT),
  mode: z.enum(['snapshot', 'latest']).optional(),
  nodeMode: z.enum(['whole', 'failed_node']).optional(),
});

export const flowRunReplaySchema = z.object({
  nodeId: z.string().trim().min(1).optional(),
  mode: z.enum(['snapshot', 'latest']).optional(),
});

export const flowRunCleanupSchema = z.object({
  dryRun: z.boolean().optional(),
});

export const flowRunRetentionSchema = z.object({
  enabled: z.boolean(),
  successDays: z.number().int().min(1).max(365),
  failureDays: z.number().int().min(1).max(365),
  maxPerWorkflow: z.number().int().min(50).max(5000),
});

export const flowWebhookAuthSchema = z.object({
  authMode: z.enum(['bearer', 'hmac', 'both']),
});

export type FlowRunBatchReplayParsed = z.infer<typeof flowRunBatchReplaySchema>;
export type FlowRunReplayParsed = z.infer<typeof flowRunReplaySchema>;
export type FlowRunCleanupParsed = z.infer<typeof flowRunCleanupSchema>;
export type FlowRunRetentionParsed = z.infer<typeof flowRunRetentionSchema>;
export type FlowWebhookAuthParsed = z.infer<typeof flowWebhookAuthSchema>;

/** 对象键升序、数组保序的 canonical JSON；用于图快照哈希稳定比较 */
export function canonicalJsonStringify(value: unknown): string {
  return JSON.stringify(canonicalize(value));
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map((item) => canonicalize(item));
  if (!value || typeof value !== 'object') return value;
  const sorted: Record<string, unknown> = {};
  for (const key of Object.keys(value as Record<string, unknown>).sort()) {
    const item = (value as Record<string, unknown>)[key];
    if (item !== undefined) sorted[key] = canonicalize(item);
  }
  return sorted;
}
