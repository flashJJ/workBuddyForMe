import { z } from 'zod';

/**
 * v2.10 能力包清单与视图。
 *
 * 口径：ZIP 根目录固定 `wbfm-capability.json` + `payload/**`；
 * 清单声明 kind/permissions/entry/checksums，安装侧 fail-closed 校验；
 * 本期只把 skill / mcp 两类登记为可执行 effect，其余 kind 保留但安装拒绝。
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
  /** 可选签名（本期只记录不验证） */
  signature: z.string().max(4096).optional(),
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

/** 本期已接入 effect 的 kind（其余安装时明确拒绝） */
export const CAPABILITY_SUPPORTED_KINDS: CapabilityKind[] = ['skill', 'mcp'];
