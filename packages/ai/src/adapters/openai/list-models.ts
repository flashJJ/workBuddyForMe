import { fetchJson } from '../../http/fetch-with-retry';
import type { DiscoveredModel } from '@wbfm/shared';
import type { ProviderConnection } from '../../types';
import { OPENAI_ENDPOINTS, joinEndpoint } from './url';

interface ModelsResponse {
  data: Array<{ id: string }>;
}

/** GET /models；testConnection 复用本方法做轻量探活。
 *  OpenAI 兼容协议无统一上下文长度字段，contextLength 恒为 null（由用户在设置页手动填写）。 */
export async function openAiListModels(
  connection: ProviderConnection,
  signal?: AbortSignal,
): Promise<DiscoveredModel[]> {
  const response = await fetchJson(joinEndpoint(connection.baseUrl, OPENAI_ENDPOINTS.models), {
    apiKey: connection.apiKey,
    signal,
  });
  const payload = (await response.json()) as ModelsResponse;
  return payload.data
    .map((item) => ({ id: item.id, contextLength: null }))
    .sort((a, b) => a.id.localeCompare(b.id));
}
