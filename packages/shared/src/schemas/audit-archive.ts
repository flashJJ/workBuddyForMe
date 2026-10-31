import { z } from 'zod';

/**
 * v2.15 M2：审计归档与外部锚点契约。
 * - 归档按 created_at 闭区间导出 JSONL + anchor.json；
 * - 锚点同时记录区间尾与全账本尾，用于发现尾部截断；
 * - 校验是只读业务结果，不写 audit_verified。
 */

export const AUDIT_ARCHIVE_LIMITS = {
  maxEvents: 50_000,
  maxRangeDays: 366,
  maxZipBytes: 20 * 1024 * 1024,
  maxChainEvents: 100_000,
} as const;

export const auditArchiveQuerySchema = z.object({
  from: z.string().datetime({ offset: true }),
  to: z.string().datetime({ offset: true }),
});
export type AuditArchiveQuery = z.infer<typeof auditArchiveQuerySchema>;

const hashSchema = z.string().regex(/^[a-f0-9]{64}$/);

export const auditAnchorRangeSchema = z.object({
  from: z.string().datetime({ offset: true }),
  to: z.string().datetime({ offset: true }),
  count: z.number().int().nonnegative(),
  firstSeq: z.number().int().positive().nullable(),
  lastSeq: z.number().int().positive().nullable(),
  lastHash: hashSchema.nullable(),
  chain: z.object({
    ok: z.boolean(),
    checked: z.number().int().nonnegative(),
    firstBrokenSeq: z.number().int().positive().nullable(),
    truncated: z.boolean(),
  }),
});
export type AuditAnchorRange = z.infer<typeof auditAnchorRangeSchema>;

export const auditAnchorSchema = z.object({
  formatVersion: z.literal(1),
  appVersion: z.string().min(1),
  schemaVersion: z.number().int().nonnegative(),
  generatedAt: z.string().datetime({ offset: true }),
  range: auditAnchorRangeSchema,
  /** 生成时的全账本尾，用于发现归档之后的尾部删除 */
  ledger: z.object({
    lastSeq: z.number().int().positive().nullable(),
    lastHash: hashSchema.nullable(),
  }),
});
export type AuditAnchor = z.infer<typeof auditAnchorSchema>;

export const AUDIT_ANCHOR_VERIFY_CODES = [
  'ANCHOR_OK',
  'ANCHOR_TAIL_TRUNCATED',
  'ANCHOR_MISMATCH',
  'ANCHOR_CHAIN_BROKEN',
] as const;
export type AuditAnchorVerifyCode = (typeof AUDIT_ANCHOR_VERIFY_CODES)[number];
export const auditAnchorVerifyCodeSchema = z.enum(AUDIT_ANCHOR_VERIFY_CODES);

export const auditAnchorVerifyResultSchema = z.object({
  ok: z.boolean(),
  code: auditAnchorVerifyCodeSchema,
  anchor: auditAnchorSchema,
  current: z.object({
    lastSeq: z.number().int().positive().nullable(),
    lastHash: hashSchema.nullable(),
  }),
});
export type AuditAnchorVerifyResult = z.infer<typeof auditAnchorVerifyResultSchema>;
