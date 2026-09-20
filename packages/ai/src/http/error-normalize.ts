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

/** 非 2xx 响应归一化为 ProviderError（4xx 不重试，5xx 可重试） */
export function normalizeHttpError(status: number, bodyText: string, scope: string): ProviderError {
  const providerMessage = extractErrorMessage(bodyText);
  const retriable = status >= 500 && status < 600;
  return new ProviderError({
    code: 'PROVIDER_ERROR',
    message: `${scope}失败：上游返回 ${status}${providerMessage ? `（${providerMessage}）` : ''}`,
    status,
    providerMessage,
    retriable,
  });
}
