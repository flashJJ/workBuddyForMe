import type { ApiErrorBody } from '../errors/api-error';

/** 统一成功响应包络 */
export interface ApiSuccess<T> {
  success: true;
  data: T;
}

/** 统一失败响应包络 */
export interface ApiFailure {
  success: false;
  error: ApiErrorBody;
}

export type ApiEnvelope<T> = ApiSuccess<T> | ApiFailure;

export function ok<T>(data: T): ApiSuccess<T> {
  return { success: true, data };
}

export function fail(error: ApiErrorBody): ApiFailure {
  return { success: false, error };
}

/** 解包 fetch 得到的包络；失败时抛出包含 code/message 的错误 */
export function unwrapEnvelope<T>(envelope: ApiEnvelope<T>): T {
  if (envelope.success) return envelope.data;
  const err = new Error(envelope.error.message) as Error & { code?: string; details?: unknown };
  err.code = envelope.error.code;
  err.details = envelope.error.details;
  throw err;
}
