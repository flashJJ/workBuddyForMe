import { fetchJson } from '../../http/fetch-with-retry';
import type { DiscoveredModel } from '@wbfm/shared';
import type { ProviderConnection } from '../../types';
import { OLLAMA_NATIVE_ENDPOINTS, normalizeOllamaOrigin } from './url';

interface TagsResponse {
  models?: Array<{
    name?: string;
    model?: string;
    /** v0.5：Ollama 随 /api/tags 返回的模型元信息，含上下文长度 */
    details?: { context_length?: number | null };
  }>;
}

/**
 * 原生 GET /api/tags 拉取本地模型。
 * Ollama 的 OpenAI 兼容 /v1/models 在部分旧版本上不可靠，因此列表与探活走原生线。
 * v0.5：顺带探测 details.context_length 作为模型上下文长度（旧版本缺失时为 null）。
 */
export async function ollamaListModels(
  connection: ProviderConnection,
  signal?: AbortSignal,
): Promise<DiscoveredModel[]> {
  const url = `${normalizeOllamaOrigin(connection.baseUrl)}${OLLAMA_NATIVE_ENDPOINTS.tags}`;
  const response = await fetchJson(url, { apiKey: connection.apiKey, signal });
  const payload = (await response.json()) as TagsResponse;
  return (payload.models ?? [])
    .map((item) => ({
      id: item.name ?? item.model ?? '',
      contextLength:
        typeof item.details?.context_length === 'number' && item.details.context_length > 0
          ? item.details.context_length
          : null,
    }))
    .filter((item) => item.id.length > 0)
    .sort((a, b) => a.id.localeCompare(b.id));
}
