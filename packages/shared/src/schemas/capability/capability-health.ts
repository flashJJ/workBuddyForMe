/**
 * v2.12 M3：能力包健康报告契约（服务端生成，web/UI 共用类型）。
 * 零迁移：不落表、不缓存，按需计算。
 */

export const CAPABILITY_HEALTH_ISSUE_CODES = [
  'pack_dir_missing',
  'manifest_invalid',
  'checksum_mismatch',
  'payload_extra_file',
  'dependency_missing',
  'dependency_disabled',
  'dependency_version_mismatch',
  'effect_missing',
  'effect_status_mismatch',
  'signature_invalid',
  'signature_untrusted',
] as const;

export type CapabilityHealthIssueCode = (typeof CAPABILITY_HEALTH_ISSUE_CODES)[number];
export type CapabilityHealthSeverity = 'warn' | 'error';
export type CapabilityHealthStatus = 'ok' | 'warning' | 'broken';

export interface CapabilityHealthIssue {
  code: CapabilityHealthIssueCode;
  severity: CapabilityHealthSeverity;
  message: string;
  detail?: string;
}

export interface CapabilityHealth {
  id: string;
  status: CapabilityHealthStatus;
  issues: CapabilityHealthIssue[];
}

export interface CapabilityHealthReport {
  checkedAt: string;
  packs: CapabilityHealth[];
  /** 根目录下无数据库行的目录名（排除 .staging / .backup） */
  orphans: string[];
}

export interface CapabilityCleanupResult {
  removed: string[];
  skipped: string[];
}
