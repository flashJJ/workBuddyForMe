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
  INTERNAL_ERROR: 500,
} as const;

export type ErrorCode = keyof typeof ERROR_CODES;

export function httpStatusFor(code: ErrorCode): number {
  return ERROR_CODES[code];
}
