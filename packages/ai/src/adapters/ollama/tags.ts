import { fetchJson } from '../../http/fetch-with-retry';
import type { ProviderConnection } from '../../types';
import { OLLAMA_NATIVE_ENDPOINTS, normalizeOllamaOrigin } from './url';

interface TagsResponse {
  models?: Array<{ name?: string; model?: string }>;
}

/**
 * 原生 GET /api/tags 拉取本地模型。
 * Ollama 的 OpenAI 兼容 /v1/models 在部分旧版本上不可靠，因此列表与探活走原生线。
 */
export async function ollamaListModels(
  connection: ProviderConnection,
  signal?: AbortSignal,
): Promise<string[]> {
  const url = `${normalizeOllamaOrigin(connection.baseUrl)}${OLLAMA_NATIVE_ENDPOINTS.tags}`;
  const response = await fetchJson(url, { apiKey: connection.apiKey, signal });
  const payload = (await response.json()) as TagsResponse;
  return (payload.models ?? [])
    .map((item) => item.name ?? item.model ?? '')
    .filter((name) => name.length > 0)
    .sort((a, b) => a.localeCompare(b));
}
