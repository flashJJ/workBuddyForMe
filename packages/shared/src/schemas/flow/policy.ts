import { z } from 'zod';

/**
 * v4.23 节点执行策略：重试与超时。
 * 存放在节点 config 的可选键上，不新增图字段、不做数据库迁移。
 */

export const FLOW_RETRY_BOUNDS = {
  maxAttempts: { min: 1, max: 5 },
  backoffMs: { min: 100, max: 60_000 },
  maxBackoffMs: { min: 100, max: 120_000 },
  timeoutMs: { min: 1_000, max: 600_000 },
} as const;

export const flowNodeRetrySchema = z.object({
  maxAttempts: z
    .number()
    .int()
    .min(FLOW_RETRY_BOUNDS.maxAttempts.min)
    .max(FLOW_RETRY_BOUNDS.maxAttempts.max)
    .default(1),
  backoffMs: z
    .number()
    .int()
    .min(FLOW_RETRY_BOUNDS.backoffMs.min)
    .max(FLOW_RETRY_BOUNDS.backoffMs.max)
    .default(1_000),
  maxBackoffMs: z
    .number()
    .int()
    .min(FLOW_RETRY_BOUNDS.maxBackoffMs.min)
    .max(FLOW_RETRY_BOUNDS.maxBackoffMs.max)
    .default(30_000),
});

export const flowNodePolicySchema = z.object({
  retry: flowNodeRetrySchema.optional(),
  timeoutMs: z
    .number()
    .int()
    .min(FLOW_RETRY_BOUNDS.timeoutMs.min)
    .max(FLOW_RETRY_BOUNDS.timeoutMs.max)
    .optional(),
});

export type FlowNodeRetryPolicy = z.infer<typeof flowNodeRetrySchema>;
export type FlowNodePolicy = z.infer<typeof flowNodePolicySchema>;

/** 解析节点 config 上的策略；非法配置按未配置处理（保存时已校验） */
export function resolveFlowNodePolicy(config: Record<string, unknown>): FlowNodePolicy {
  const parsed = flowNodePolicySchema.safeParse({
    retry: config.retry,
    timeoutMs: config.timeoutMs,
  });
  return parsed.success ? parsed.data : {};
}
