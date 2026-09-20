import { CONNECTION_TEST_TIMEOUT_MS } from '@wbfm/shared';
import { ProviderError } from '../errors/provider-error';
import { normalizeHttpError } from './error-normalize';
import { withTimeout, type LinkedSignal } from './timeout-signal';

export interface SseOpenOptions {
  apiKey?: string | null;
  timeoutMs?: number;
  signal?: AbortSignal;
  body: unknown;
}

export interface SseChannel {
  response: Response;
  /** 流结束（正常/异常/取消）后解绑外部信号监听，避免悬挂引用 */
  dispose: () => void;
}

/**
 * 打开 SSE POST 通道。流式请求不做重试（重试会导致重复生成/计费），
 * 仅负责连接建立阶段的超时与非 2xx 归一化。
 * 成功后外部 signal 的 abort 仍持续转发给上游，直到调用 dispose。
 */
export async function openSseChannel(
  url: string,
  options: SseOpenOptions,
): Promise<SseChannel> {
  const timeoutMs = options.timeoutMs ?? CONNECTION_TEST_TIMEOUT_MS;
  const linked = withTimeout(options.signal, timeoutMs);

  let response: Response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'text/event-stream',
        ...(options.apiKey ? { Authorization: `Bearer ${options.apiKey}` } : {}),
      },
      body: JSON.stringify(options.body),
      signal: linked.signal,
    });
  } catch (error) {
    linked.dispose();
    if (linked.timedOut()) throw ProviderError.timeout(`SSE 连接 ${url}`, timeoutMs);
    if (options.signal?.aborted) throw error;
    if (error instanceof TypeError) {
      throw new ProviderError({
        code: 'PROVIDER_ERROR',
        message: `SSE 连接 ${url}失败：无法连接到上游服务`,
        retriable: false,
      });
    }
    throw error;
  }

  if (!response.ok || !response.body) {
    linked.dispose();
    const bodyText = await response.text().catch(() => '');
    throw normalizeHttpError(response.status, bodyText, `SSE 连接 ${url}`);
  }

  // 头已到达：解除连接超时；外部取消监听保留，交由 dispose 解绑
  linked.clearTimeout();
  return { response, dispose: () => linked.dispose() };
}

export type { LinkedSignal };
