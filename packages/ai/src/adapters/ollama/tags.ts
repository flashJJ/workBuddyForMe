import { fetchJson } from '../../http/fetch-with-retry';
import { OLLAMA_DEFAULT_CONTEXT_WINDOW, type DiscoveredModel } from '@wbfm/shared';
import type { ProviderConnection } from '../../types';
import { OLLAMA_NATIVE_ENDPOINTS, normalizeOllamaOrigin } from './url';

interface TagsResponse {
  models?: Array<{
    name?: string;
    model?: string;
    /** Ollama 上报的是模型架构训练上限（如 qwen2.5=32768），非运行时 num_ctx，不能直接采用 */
    details?: { context_length?: number | null };
  }>;
}

/**
 * 原生 GET /api/tags 拉取本地模型。
 * Ollama 的 OpenAI 兼容 /v1/models 在部分旧版本上不可靠，因此列表与探活走原生线。
 *
 * 上下文长度注意：details.context_length 是模型架构上限，而 Ollama 运行时
 * 默认 num_ctx=4096（除非 Modelfile 用 PARAMETER num_ctx 覆盖；/api/show 也不
 * 暴露有效值）。登记成架构上限会让应用按 32768 预算拼请求、被 4096 的运行时
 * 400 拒绝（exceed_context_size_error），因此统一上报 OLLAMA_DEFAULT_CONTEXT_WINDOW；
 * 用户在 Modelfile 调大 num_ctx 后可在模型管理里手动改该字段。
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
      contextLength: OLLAMA_DEFAULT_CONTEXT_WINDOW,
    }))
    .filter((item) => item.id.length > 0)
    .sort((a, b) => a.id.localeCompare(b.id));
}
