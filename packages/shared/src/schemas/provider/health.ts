import { z } from 'zod';

/** v4.19：供应商健康度（只读代理指标，来自本机会话事件） */
export const providerHealthRowSchema = z.object({
  providerId: z.string(),
  providerName: z.string(),
  enabled: z.boolean().nullable(),
  /** 按错误码聚合的失败次数 */
  failures: z.record(z.number().int().nonnegative()),
  failureTotal: z.number().int().nonnegative(),
  /** 作为来源模型被自动切换的次数 */
  switches: z.number().int().nonnegative(),
  lastFailureAt: z.string().nullable(),
});

export const providerHealthReportSchema = z.object({
  days: z.number().int().positive(),
  since: z.string(),
  rows: z.array(providerHealthRowSchema),
});

export type ProviderHealthRow = z.infer<typeof providerHealthRowSchema>;
export type ProviderHealthReport = z.infer<typeof providerHealthReportSchema>;
