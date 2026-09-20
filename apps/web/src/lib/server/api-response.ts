import { ApiError, fail, ok } from '@wbfm/shared';
import { ProviderError } from '@wbfm/ai';
import { ZodError } from 'zod';

const JSON_HEADERS = { 'content-type': 'application/json; charset=utf-8' } as const;

export function jsonOk<T>(data: T, status = 200): Response {
  return new Response(JSON.stringify(ok(data)), { status, headers: JSON_HEADERS });
}

export function jsonError(error: ApiError): Response {
  return new Response(JSON.stringify(fail(error.toBody())), {
    status: error.status,
    headers: JSON_HEADERS,
  });
}

/** Zod 错误转 422 业务错误（details 携带字段级问题） */
export function fromZodError(error: ZodError): ApiError {
  return new ApiError(
    'VALIDATION_ERROR',
    '请求参数校验失败',
    error.issues.map((issue) => ({
      path: issue.path.join('.'),
      message: issue.message,
    })),
  );
}

/** 未知错误兜底：业务错误透传，供应商错误按领域码归一，Zod 转 422，其余 500 并记录服务端日志 */
export function toErrorResponse(error: unknown): Response {
  if (error instanceof ApiError) return jsonError(error);
  if (error instanceof ProviderError) {
    return jsonError(new ApiError(error.code, error.message));
  }
  if (error instanceof ZodError) return jsonError(fromZodError(error));
  console.error('[api] 未处理错误：', error);
  return jsonError(new ApiError('INTERNAL_ERROR', '服务器内部错误'));
}
