import { DEFAULT_HTTP_TIMEOUT_MS } from '@wbfm/shared';
import { ProviderError } from '../errors/provider-error';
import { backoffDelayMs, sleep } from './backoff';
import { normalizeHttpError } from './error-normalize';
import { withTimeout } from './timeout-signal';

export interface HttpCallOptions {
  apiKey?: string | null;
  timeoutMs?: number;
  /** 连接错误/5xx 的重试次数（默认 2）；4xx 不重试 */
  maxRetries?: number;
  signal?: AbortSignal;
}

export interface FetchJsonOptions extends HttpCallOptions {
  method?: string;
  body?: unknown;
}

export function buildHeaders(
  apiKey: string | null | undefined,
  extra?: RequestInit['headers'],
): Headers {
  const headers = new Headers(extra);
  headers.set('Content-Type', 'application/json');
  headers.set('Accept', 'application/json');
  if (apiKey) headers.set('Authorization', `Bearer ${apiKey}`);
  return headers;
}

function isNetworkFailure(error: unknown): boolean {
  return error instanceof TypeError;
}

/** 带超时、指数退避重试与错误归一化的 JSON 请求 */
export async function fetchJson(
  url: string,
  options: FetchJsonOptions = {},
): Promise<Response> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_HTTP_TIMEOUT_MS;
  const maxRetries = options.maxRetries ?? 2;
  const scope = `请求 ${url}`;

  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    const linked = withTimeout(options.signal, timeoutMs);
    try {
      const response = await fetch(url, {
        method: options.method ?? 'GET',
        headers: buildHeaders(options.apiKey),
        body: options.body === undefined ? undefined : JSON.stringify(options.body),
        signal: linked.signal,
      });
      if (response.ok) return response;

      const bodyText = await response.text();
      const error = normalizeHttpError(response.status, bodyText, scope);
      if (error.retriable && attempt < maxRetries) {
        await sleep(backoffDelayMs(attempt), options.signal);
        continue;
      }
      throw error;
    } catch (error) {
      linked.dispose();
      if (error instanceof ProviderError) throw error;
      if (linked.timedOut()) {
        if (attempt < maxRetries) {
          await sleep(backoffDelayMs(attempt), options.signal);
          continue;
        }
        throw ProviderError.timeout(scope, timeoutMs);
      }
      if (options.signal?.aborted) throw error;
      if (isNetworkFailure(error) && attempt < maxRetries) {
        await sleep(backoffDelayMs(attempt), options.signal);
        continue;
      }
      if (isNetworkFailure(error)) {
        throw new ProviderError({
          code: 'PROVIDER_ERROR',
          message: `${scope}失败：无法连接到上游服务`,
          retriable: true,
        });
      }
      throw error;
    } finally {
      linked.dispose();
    }
  }
  throw new ProviderError({ code: 'PROVIDER_ERROR', message: `${scope}失败：重试耗尽` });
}
