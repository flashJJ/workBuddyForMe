import { ERROR_CODES, type ErrorCode, httpStatusFor } from './error-codes';

export interface ApiErrorBody {
  code: ErrorCode;
  message: string;
  details?: unknown;
}

/** 全服务统一业务错误 */
export class ApiError extends Error {
  readonly code: ErrorCode;
  readonly status: number;
  readonly details?: unknown;

  constructor(code: ErrorCode, message: string, details?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.status = httpStatusFor(code);
    this.details = details;
  }

  static notFound(resource: string, id?: string): ApiError {
    return new ApiError('NOT_FOUND', id ? `${resource}不存在：${id}` : `${resource}不存在`);
  }

  static validation(message: string, details?: unknown): ApiError {
    return new ApiError('VALIDATION_ERROR', message, details);
  }

  static conflict(message: string): ApiError {
    return new ApiError('CONFLICT', message);
  }

  toBody(): ApiErrorBody {
    return this.details === undefined
      ? { code: this.code, message: this.message }
      : { code: this.code, message: this.message, details: this.details };
  }
}

export { ERROR_CODES };
