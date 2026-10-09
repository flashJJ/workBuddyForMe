import type { ErrorCode } from '@wbfm/shared/errors';
import { ERROR_CODES } from '@wbfm/shared/errors';
import type { MessageKey, MessageVars } from '@wbfm/shared/i18n';
import { ApiClientError } from '@/lib/api/client';

/**
 * 错误码本地化（v1.2 M4 T4.4）：
 * 信封 {success:false, error:{code,message}} 中 code 是主语，服务端 message 仅日志/开发者提示；
 * 用户可见路径统一经本 helper 按 errors.<code> 字典呈现。
 */

type TFn = (key: MessageKey, vars?: MessageVars) => string;

export type ResolvedErrorKind = ErrorCode | 'NETWORK_ERROR' | 'UNKNOWN_ERROR';

const KNOWN_CODES = new Set<string>(Object.keys(ERROR_CODES));

export interface ResolvedError {
  kind: ResolvedErrorKind;
  /** 面向用户的本地化文案 */
  message: string;
  /** 服务端/开发者细节（默认不展示，联调面板可显式附加） */
  detail?: string;
}

export function resolveError(error: unknown, t: TFn): ResolvedError {
  if (error instanceof ApiClientError) {
    if (KNOWN_CODES.has(error.code)) {
      return {
        kind: error.code as ErrorCode,
        message: t(`errors.${error.code}` as MessageKey),
        detail: error.message,
      };
    }
    return {
      kind: 'UNKNOWN_ERROR',
      message: t('errors.UNKNOWN_ERROR'),
      detail: error.message,
    };
  }
  // 浏览器/Electron 下 fetch 断网以 TypeError 抛出（Failed to fetch / Network request failed）
  if (error instanceof TypeError) {
    return { kind: 'NETWORK_ERROR', message: t('errors.NETWORK_ERROR') };
  }
  return {
    kind: 'UNKNOWN_ERROR',
    message: t('errors.UNKNOWN_ERROR'),
    detail: error instanceof Error ? error.message : undefined,
  };
}

export interface ErrorTextOptions {
  /** 非 API 异常（未知错误）时的业务兜底文案键，如 assistants.deleteFailed */
  fallback?: MessageKey;
  /** 是否在本地化文案后附加服务端细节（用于供应商测试连接等联调场景） */
  withDetail?: boolean;
}

/**
 * 便捷转纯文本：toast/行内状态直接可用。
 * - 已知错误码/断网 → errors 字典文案
 * - 未知异常 → fallback（未给则 errors.UNKNOWN_ERROR）
 * - withDetail 时以「主文案（细节）」形式附加
 */
export function errorText(error: unknown, t: TFn, options: ErrorTextOptions = {}): string {
  const resolved = resolveError(error, t);
  let message: string;
  if (resolved.kind === 'UNKNOWN_ERROR' && options.fallback) {
    message = t(options.fallback);
  } else {
    message = resolved.message;
  }
  if (options.withDetail && resolved.detail) {
    // 后缀键自带各语言习惯的间隔（中文全角括号无空格，英文半角括号前带空格）
    return `${message}${t('errors.detailSuffix', { detail: resolved.detail })}`;
  }
  return message;
}
