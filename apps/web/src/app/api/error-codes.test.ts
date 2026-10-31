import { describe, expect, it } from 'vitest';
import { ApiError, ERROR_CODES, type ErrorCode } from '@wbfm/shared/errors';
import { toErrorResponse } from '@/lib/server/api-response';

/** 领域错误码 → HTTP 状态映射全量断言（新增错误码必须在此登记） */
describe('API 错误码一致性（TR-33.1）', () => {
  it('领域错误码 → HTTP 状态映射全量断言', async () => {
    const expectations: Array<[ErrorCode, number]> = [
      ['VALIDATION_ERROR', 422],
      ['UNAUTHORIZED', 401],
      ['FORBIDDEN', 403],
      ['NOT_FOUND', 404],
      ['CONFLICT', 409],
      ['PROVIDER_ERROR', 502],
      ['PROVIDER_TIMEOUT', 504],
      ['SERVICE_UNAVAILABLE', 503],
      ['SKILL_VERSION_MISSING', 409],
      ['SKILL_ROLLBACK_FAILED', 500],
      ['FLOW_VERSION_NOT_FOUND', 404],
      ['CAPABILITY_DOWNGRADE_CONFIRM_REQUIRED', 422],
      ['CAPABILITY_DOWNGRADE_TARGET_MISMATCH', 422],
      ['CAPABILITY_DEPENDENTS_ACTIVE', 409],
      ['CAPABILITY_VERSION_NOT_NEWER', 422],
      ['DIAGNOSTICS_TIMEOUT', 503],
      ['INTERNAL_ERROR', 500],
    ];
    // 另含 422/501×2 三个补充码
    expect(Object.keys(ERROR_CODES)).toHaveLength(expectations.length + 3);

    for (const [code, status] of expectations) {
      const response = toErrorResponse(new ApiError(code, `示例错误：${code}`));
      expect(response.status).toBe(status);
      const payload = await response.json();
      expect(payload.success).toBe(false);
      expect(payload.error.code).toBe(code);
    }
  });
});
