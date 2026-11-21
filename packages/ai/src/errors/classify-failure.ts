import {
  MODEL_FAILURE_AUTO_SWITCH,
  type ModelFailure,
  type ModelFailureCode,
  type ModelFailurePhase,
} from '@wbfm/shared/errors';
import { ProviderError } from './provider-error';
import { isContextOverflowError } from '../http/error-normalize';

/**
 * v4.18 A 线：把上游异常归一化为统一失败码。
 * 只做分类与自动切换判定，不改变原始错误；调用方决定是否切换/重试。
 * 调用方主动取消时返回 null（不是模型故障）。
 */

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError';
}

function codeFromStatus(status: number | undefined): ModelFailureCode | null {
  if (status === undefined) return null;
  if (status === 401 || status === 403) return 'auth_failed';
  if (status === 408) return 'timeout';
  if (status === 429) return 'rate_limited';
  if (status >= 500 && status < 600) return 'provider_5xx';
  return null;
}

export function classifyModelFailure(
  error: unknown,
  phase: ModelFailurePhase,
): ModelFailure | null {
  if (isAbortError(error)) return null;

  let code: ModelFailureCode = 'unknown';
  let status: number | undefined;

  if (error instanceof ProviderError) {
    status = error.status;
    if (error.reason === 'stream_interrupted') code = 'stream_interrupted';
    else if (isContextOverflowError(error)) code = 'context_overflow';
    else if (error.code === 'PROVIDER_TIMEOUT') code = 'timeout';
    else code = codeFromStatus(status) ?? 'unknown';
  } else if (error instanceof Error) {
    if (isContextOverflowError(error)) code = 'context_overflow';
    else if (/timeout|timed out|超时/i.test(error.message)) code = 'timeout';
  }

  return {
    code,
    phase,
    ...(status !== undefined ? { status } : {}),
    retriable: MODEL_FAILURE_AUTO_SWITCH[code],
  };
}
