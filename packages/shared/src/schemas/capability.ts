import { z } from 'zod';
import { eventDefinitionSchema } from './event';
import { flowGraphSchema } from './flow';
import { MOTION_MOODS, MOTION_SEGMENTS } from './motion-asset';
import { RUN_EVIDENCE_CHAINS } from './report';

/**
 * v2.10 能力包清单与视图；v2.11 扩展 workflow / pet-action 两类 payload。
 *
 * 口径：ZIP 根目录固定 `wbfm-capability.json` + `payload/**`；
 * 清单声明 kind/permissions/entry/checksums，安装侧 fail-closed 校验；
 * v2.11 M1 起 skill / mcp / workflow / pet-action 四类可执行，其余两类仍拒绝安装。
 */

export const CAPABILITY_KINDS = [
  'skill',
  'mcp',
  'workflow',
  'pet-action',
  'event-script',
  'report-widget',
] as const;
export type CapabilityKind = (typeof CAPABILITY_KINDS)[number];

export const CAPABILITY_PERMISSIONS = [
  'skill:install',
  'mcp:connect',
  'workflow:install',
  'pet:action',
  'events:write',
  'report:widget',
] as const;
export type CapabilityPermission = (typeof CAPABILITY_PERMISSIONS)[number];

export const CAPABILITY_STATUSES = ['enabled', 'disabled'] as const;
export type CapabilityStatus = (typeof CAPABILITY_STATUSES)[number];

const idSchema = z
  .string()
  .trim()
  .min(3)
  .max(80)
  .regex(/^[a-z0-9][a-z0-9._-]*$/, 'id 仅允许小写字母/数字/点/下划线/中划线');

const versionSchema = z.string().trim().regex(/\d+(\.\d+){0,2}/, '版本格式应为 1 / 1.0 / 1.0.0');

/** v2.12：签名策略（默认 warn；off 显式跳过验签） */
export const CAPABILITY_SIGNATURE_POLICIES = ['off', 'warn', 'require'] as const;
export type CapabilitySignaturePolicy = (typeof CAPABILITY_SIGNATURE_POLICIES)[number];

/** v2.12：验签结果五态（unchecked 仅用于 UI 展示，不在验签结果中出现） */
export const CAPABILITY_SIGNATURE_STATUSES = [
  'none',
  'valid',
  'untrusted',
  'invalid',
  'malformed',
] as const;
export type CapabilitySignatureStatus = (typeof CAPABILITY_SIGNATURE_STATUSES)[number];
export type CapabilitySignatureViewStatus = CapabilitySignatureStatus | 'unchecked';

export const CAPABILITY_TRUSTED_KEYS_MAX = 20;

const trustedKeyIdSchema = z
  .string()
  .trim()
  .min(3)
  .max(32)
  .regex(/^[a-z0-9][a-z0-9._-]*$/, 'keyId 仅允许小写字母/数字/点/下划线/中划线');

/** v2.12：本地信任公钥（PEM SPKI；可导入性由 core 校验） */
export const capabilityTrustedKeySchema = z.object({
  id: trustedKeyIdSchema,
  label: z.string().trim().min(1).max(40),
  publicKey: z.string().trim().min(1).max(1024),
  createdAt: z.string().trim().min(1).max(40),
});
export type CapabilityTrustedKey = z.infer<typeof capabilityTrustedKeySchema>;

export const capabilityDependencySchema = z.object({
  id: idSchema,
  version: versionSchema.optional(),
});
export type CapabilityDependency = z.infer<typeof capabilityDependencySchema>;

export const capabilityManifestSchema = z.object({
  id: idSchema,
  version: versionSchema,
  kind: z.enum(CAPABILITY_KINDS),
  name: z.string().trim().min(1).max(80),
  description: z.string().trim().max(500).default(''),
  permissions: z.array(z.enum(CAPABILITY_PERMISSIONS)).default([]),
  /** payload/ 下相对路径，必须在 checksums 内 */
  entry: z
    .string()
    .trim()
    .regex(/^payload\/[a-zA-Z0-9._/-]+$/, 'entry 必须位于 payload/ 下'),
  dependencies: z.array(capabilityDependencySchema).max(20).default([]),
  /** 相对路径 → sha256（覆盖 payload/ 下全部文件） */
  checksums: z.record(z.string(), z.string().regex(/^[a-f0-9]{64}$/)).default({}),
  /** 可选签名（v2.12 起按策略验签） */
  signature: z.string().max(4096).optional(),
  /** v2.12：签名密钥 id（必须在本地信任库中；缺省时尝试全部公钥） */
  signatureKeyId: trustedKeyIdSchema.optional(),
});
export type CapabilityManifest = z.infer<typeof capabilityManifestSchema>;

export interface CapabilityView {
  id: string;
  version: string;
  kind: CapabilityKind;
  name: string;
  description: string;
  permissions: CapabilityPermission[];
  status: CapabilityStatus;
  effectRef: string | null;
  lastError: string | null;
  installedAt: string;
  updatedAt: string;
  /** v2.12：服务层按策略计算的验签徽章；off 时为 unchecked */
  signatureStatus?: CapabilitySignatureViewStatus;
}

/** 每种 kind 必需权限（安装侧校验 permissions 覆盖） */
export const CAPABILITY_REQUIRED_PERMISSION: Record<CapabilityKind, CapabilityPermission> = {
  skill: 'skill:install',
  mcp: 'mcp:connect',
  workflow: 'workflow:install',
  'pet-action': 'pet:action',
  'event-script': 'events:write',
  'report-widget': 'report:widget',
};

/** 当前已接入 effect 的 kind（其余安装时明确拒绝） */
export const CAPABILITY_SUPPORTED_KINDS: CapabilityKind[] = [
  'skill',
  'mcp',
  'workflow',
  'pet-action',
  'event-script',
  'report-widget',
];

/** 每种 kind 的 entry 固定路径（安装侧强校验） */
export const CAPABILITY_ENTRY_BY_KIND: Record<CapabilityKind, string> = {
  skill: 'payload/skill.json',
  mcp: 'payload/server.json',
  workflow: 'payload/workflow.json',
  'pet-action': 'payload/action.json',
  'event-script': 'payload/script.json',
  'report-widget': 'payload/widget.json',
};

/** v2.11：workflow 能力包 payload */
export const workflowCapabilityPayloadSchema = z.object({
  name: z.string().trim().min(1).max(60),
  description: z.string().trim().max(200).default(''),
  icon: z.string().trim().max(32).optional(),
  color: z.string().trim().max(32).optional(),
  graph: flowGraphSchema,
});
export type WorkflowCapabilityPayload = z.infer<typeof workflowCapabilityPayloadSchema>;

/** v2.11：pet-action 能力包 payload */
export const petActionCapabilityPayloadSchema = z.object({
  name: z.string().trim().min(1).max(60),
  file: z
    .string()
    .trim()
    .regex(/^payload\/[a-zA-Z0-9._/-]+\.vrma$/i, 'file 必须是 payload/ 下的 .vrma'),
  entryKey: z.string().trim().min(1).max(32).optional(),
  segment: z.enum(MOTION_SEGMENTS).optional(),
  mood: z.enum(MOTION_MOODS).optional(),
  minRelationshipLevel: z.number().int().min(0).max(3).optional(),
});
export type PetActionCapabilityPayload = z.infer<typeof petActionCapabilityPayloadSchema>;

/** v2.11：event-script 能力包 payload（仅短语触发） */
export const eventScriptCapabilityPayloadSchema = z
  .object({
    definition: eventDefinitionSchema,
    trigger: z.object({
      kind: z.literal('phrase'),
      phrases: z.array(z.string().trim().min(2).max(24)).min(1).max(5),
    }),
  })
  .superRefine((value, ctx) => {
    const def = value.definition;
    if (!def.id.startsWith('usr.')) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['definition', 'id'], message: '安装剧本 id 必须为 usr.*' });
    }
    const slug = def.id.slice(4);
    if (!/^[a-z0-9]{3,40}$/.test(slug)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['definition', 'id'],
        message: '安装剧本 id 必须形如 usr.<3-40 位小写字母/数字>',
      });
    }
    if (!def.title) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['definition', 'title'],
        message: '安装剧本必须使用 title 字面量',
      });
    }
    def.steps.forEach((step, index) => {
      if (step.kind === 'speech' && !step.text) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['definition', 'steps', index, 'text'],
          message: '安装剧本台词必须使用 text 字面量',
        });
      }
    });
  });
export type EventScriptCapabilityPayload = z.infer<typeof eventScriptCapabilityPayloadSchema>;

/** v2.11：report-widget 能力包 payload（仅声明式指标） */
export const REPORT_WIDGET_METRICS = [
  'success_rate',
  'run_count',
  'median_duration',
  'failure_top',
] as const;
export type ReportWidgetMetric = (typeof REPORT_WIDGET_METRICS)[number];

export const reportWidgetCapabilityPayloadSchema = z.object({
  title: z.string().trim().min(1).max(40),
  chain: z.enum(RUN_EVIDENCE_CHAINS),
  metric: z.enum(REPORT_WIDGET_METRICS),
  windowDays: z.union([z.literal(7), z.literal(30), z.literal(90)]),
});
export type ReportWidgetCapabilityPayload = z.infer<typeof reportWidgetCapabilityPayloadSchema>;
