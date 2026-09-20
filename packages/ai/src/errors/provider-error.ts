import type { ErrorCode } from '@wbfm/shared';

export type ProviderErrorCode = Extract<
  ErrorCode,
  'PROVIDER_ERROR' | 'PROVIDER_TIMEOUT' | 'UNSUPPORTED_PROVIDER'
>;

/** 归一化后的供应商错误：携带领域错误码、上游 HTTP 状态与原始消息 */
export class ProviderError extends Error {
  readonly code: ProviderErrorCode;
  readonly status?: number;
  readonly providerMessage?: string;
  readonly retriable: boolean;

  constructor(params: {
    code: ProviderErrorCode;
    message: string;
    status?: number;
    providerMessage?: string;
    retriable?: boolean;
  }) {
    super(params.message);
    this.name = 'ProviderError';
    this.code = params.code;
    this.status = params.status;
    this.providerMessage = params.providerMessage;
    this.retriable = params.retriable ?? false;
  }

  static timeout(scope: string, ms: number): ProviderError {
    return new ProviderError({
      code: 'PROVIDER_TIMEOUT',
      message: `${scope}超时（${ms}ms）`,
      retriable: true,
    });
  }

  static unsupported(protocol: string): ProviderError {
    return new ProviderError({
      code: 'UNSUPPORTED_PROVIDER',
      message: `协议 "${protocol}" 的适配器尚未启用`,
    });
  }
}
