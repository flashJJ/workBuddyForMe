/** 领域错误码 → HTTP 状态码映射（唯一事实源，与 docs/api.md 对应） */
export const ERROR_CODES = {
  VALIDATION_ERROR: 422,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  EMBEDDING_NOT_CONFIGURED: 422,
  UNSUPPORTED_PROVIDER: 501,
  /** 功能通道在当前版本尚未接通（如 v1.4 M1 骨架期的真实角色客户端，M2 接通） */
  NOT_IMPLEMENTED: 501,
  PROVIDER_ERROR: 502,
  PROVIDER_TIMEOUT: 504,
  /** v2.13：审计账本不可写等治理依赖暂不可用（fail-closed） */
  SERVICE_UNAVAILABLE: 503,
  /** v2.14：技能版本快照不存在，无法回退 */
  SKILL_VERSION_MISSING: 409,
  /** v2.15：当前启用版本不可删除 */
  SKILL_VERSION_ACTIVE: 409,
  /** v2.15：仅剩一个版本，不可删除 */
  SKILL_VERSION_LAST: 409,
  /** v2.15：删除技能快照目录失败 */
  SKILL_VERSION_DELETE_FAILED: 500,
  /** v2.14：技能回退失败（已尝试恢复原目录） */
  SKILL_ROLLBACK_FAILED: 500,
  /** v2.14：工作流版本不存在，无法设为生产 */
  FLOW_VERSION_NOT_FOUND: 404,
  /** v2.14：降级安装缺少二次确认 */
  CAPABILITY_DOWNGRADE_CONFIRM_REQUIRED: 422,
  /** v2.14：降级目标版本与确认版本不一致 */
  CAPABILITY_DOWNGRADE_TARGET_MISMATCH: 422,
  /** v2.14：启用中的能力包仍依赖当前版本，拒绝降级 */
  CAPABILITY_DEPENDENTS_ACTIVE: 409,
  /** v2.14：版本未变化且不满足修复条件 */
  CAPABILITY_VERSION_NOT_NEWER: 422,
  /** v2.14：诊断包生成超时 */
  DIAGNOSTICS_TIMEOUT: 503,
  INTERNAL_ERROR: 500,
} as const;

export type ErrorCode = keyof typeof ERROR_CODES;

export function httpStatusFor(code: ErrorCode): number {
  return ERROR_CODES[code];
}
