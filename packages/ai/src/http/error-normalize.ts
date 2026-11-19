import { ProviderError } from '../errors/provider-error';

/** 从上游响应体中尽力提取错误消息 */
export function extractErrorMessage(bodyText: string): string | undefined {
  const trimmed = bodyText.trim();
  if (!trimmed) return undefined;
  try {
    const parsed = JSON.parse(trimmed) as
      | { error?: { message?: string; code?: string }; message?: string }
      | string;
    if (typeof parsed === 'string') return parsed;
    if (parsed.error?.message) return parsed.error.message;
    if (parsed.message) return parsed.message;
    return trimmed.slice(0, 500);
  } catch {
    return trimmed.slice(0, 500);
  }
}

/** 上游上下文窗口超限的错误特征（Ollama/本地服务常见） */
const CONTEXT_OVERFLOW_RE = /exceed(?:s|_)?_?(?:the_)?context|context size|maximum context|context_length_exceeded/i;

/** 是否为上下文窗口超限错误（供上层自动缩上下文后重试一次） */
export function isContextOverflowError(error: unknown): boolean {
  if (error instanceof ProviderError) {
    return CONTEXT_OVERFLOW_RE.test(`${error.providerMessage ?? ''} ${error.message}`);
  }
  if (error instanceof Error) return CONTEXT_OVERFLOW_RE.test(error.message);
  return false;
}

/** 非 2xx 响应归一化为 ProviderError（4xx 不重试，5xx 可重试） */export function normalizeHttpError(status: number, bodyText: string, scope: string): ProviderError {
  const providerMessage = extractErrorMessage(bodyText);
  const retriable = status >= 500 && status < 600;
  const overflowHint =
    providerMessage && CONTEXT_OVERFLOW_RE.test(providerMessage)
      ? '；处理建议：在「设置→模型管理」把该模型的上下文窗口改成服务端实际值（Ollama 默认 4096），' +
        '或调大本地服务的上下文长度（如 Ollama Modelfile 设置 PARAMETER num_ctx 8192 后 ollama create）后重试'
      : '';
  return new ProviderError({
    code: 'PROVIDER_ERROR',
    message: `${scope}失败：上游返回 ${status}${providerMessage ? `（${providerMessage}）` : ''}${overflowHint}`,
    status,
    providerMessage,
    retriable,
  });
}
