import { z } from 'zod';
import { operationBindingSchema } from './agent-binding';

/**
 * v2.13 M3：执行审计账本契约。
 * - 事件种类 / 主体 / 决策固定枚举，服务端与页面共用；
 * - 查询只按 seq 游标向后翻，不提供删除 / 修改语义；
 * - 完整性校验返回首个断链 seq。
 */

export const AUDIT_EVENT_KINDS = [
  'policy_updated',
  'policy_denied',
  'approval_requested',
  'approval_granted',
  'approval_denied',
  'approval_timeout',
  'binding_drift',
  'run_started',
  'run_finished',
  'scheduled_run_started',
  'scheduled_run_finished',
  'unattended_blocked',
  'skill_version_deleted',
  'audit_verified',
] as const;

export type AuditEventKind = (typeof AUDIT_EVENT_KINDS)[number];
export const auditEventKindSchema = z.enum(AUDIT_EVENT_KINDS);

export const AUDIT_ACTORS = ['user', 'agent', 'system'] as const;
export type AuditActor = (typeof AUDIT_ACTORS)[number];
export const auditActorSchema = z.enum(AUDIT_ACTORS);

export const AUDIT_DECISIONS = ['allow', 'deny', 'ask'] as const;
export type AuditDecision = (typeof AUDIT_DECISIONS)[number];
export const auditDecisionSchema = z.enum(AUDIT_DECISIONS);

/** 首条事件的 prev_hash 哨兵 */
export const AUDIT_GENESIS_HASH = 'GENESIS';

export const AUDIT_CHAIN_BROKEN = 'AUDIT_CHAIN_BROKEN';
export const AUDIT_UNAVAILABLE = 'AUDIT_UNAVAILABLE';

export const auditEventViewSchema = z.object({
  id: z.string(),
  seq: z.number().int().positive(),
  createdAt: z.string(),
  kind: auditEventKindSchema,
  actor: auditActorSchema,
  runId: z.string().nullable(),
  conversationId: z.string().nullable(),
  tool: z.string().nullable(),
  decision: auditDecisionSchema.nullable(),
  reasonCode: z.string().nullable(),
  policyHash: z.string().nullable(),
  binding: operationBindingSchema.nullable(),
  outcome: z.string().nullable(),
  prevHash: z.string(),
  hash: z.string(),
});

export type AuditEventView = z.infer<typeof auditEventViewSchema>;

/** GET /api/audit/events：createdAt 闭区间，seq 游标向后翻页 */
export const auditQuerySchema = z.object({
  from: z.string().min(1).optional(),
  to: z.string().min(1).optional(),
  kind: auditEventKindSchema.optional(),
  runId: z.string().min(1).optional(),
  cursor: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

export type AuditQuery = z.infer<typeof auditQuerySchema>;

export const auditVerifyResultSchema = z.object({
  ok: z.boolean(),
  checked: z.number().int().nonnegative(),
  firstBrokenSeq: z.number().int().positive().nullable(),
});

export type AuditVerifyResult = z.infer<typeof auditVerifyResultSchema>;
