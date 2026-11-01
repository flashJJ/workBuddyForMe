import type { ErrorCode } from '@wbfm/shared/errors';

export type ProviderErrorCode = Extract<
  ErrorCode,
  'PROVIDER_ERROR' | 'PROVIDER_TIMEOUT' | 'UNSUPPORTED_PROVIDER'
>;

/** 供应商错误的可识别原因（不扩展 API 错误码，只用于内部分支判断） */
export type ProviderErrorReason = 'models_unsupported';

/** 归一化后的供应商错误：携带领域错误码、上游 HTTP 状态与原始消息 */
export class ProviderError extends Error {
  readonly code: ProviderErrorCode;
  readonly status?: number;
  readonly providerMessage?: string;
  readonly retriable: boolean;
  readonly reason?: ProviderErrorReason;

  constructor(params: {
    code: ProviderErrorCode;
    message: string;
    status?: number;
    providerMessage?: string;
    retriable?: boolean;
    reason?: ProviderErrorReason;
  }) {
    super(params.message);
    this.name = 'ProviderError';
    this.code = params.code;
    this.status = params.status;
    this.providerMessage = params.providerMessage;
    this.retriable = params.retriable ?? false;
    this.reason = params.reason;
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

  /** 供应商不提供 GET /models（火山方舟 Agent Plan 等）；不是鉴权失败，需引导手填 Model ID */
  static modelsUnsupported(url: string, status: number, providerMessage?: string): ProviderError {
    return new ProviderError({
      code: 'PROVIDER_ERROR',
      status,
      providerMessage,
      reason: 'models_unsupported',
      message:
        `请求 ${url} 失败：该供应商未提供模型列表接口（HTTP ${status}）。` +
        '请在「模型管理」手动填写 Model ID（火山方舟 Agent Plan / Coding Plan 请使用对应套餐控制台给出的 Model ID），保存后再测试连接。',
    });
  }
}
