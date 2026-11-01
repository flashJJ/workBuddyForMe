import { fetchJson } from '../../http/fetch-with-retry';
import { ProviderError } from '../../errors/provider-error';
import type { DiscoveredModel } from '@wbfm/shared/types';
import type { ProviderConnection } from '../../types';
import { OPENAI_ENDPOINTS, joinEndpoint } from './url';

interface ModelsResponse {
  data: Array<{ id: string }>;
}

/** GET /models；testConnection 复用本方法做轻量探活。
 *  OpenAI 兼容协议无统一上下文长度字段，contextLength 恒为 null（由用户在设置页手动填写）。
 *  部分厂商（火山方舟 Agent Plan / Coding Plan）不提供该端点：404/405 归一化为「请手填 Model ID」。 */
export async function openAiListModels(
  connection: ProviderConnection,
  signal?: AbortSignal,
): Promise<DiscoveredModel[]> {
  const url = joinEndpoint(connection.baseUrl, OPENAI_ENDPOINTS.models);
  let response: Response;
  try {
    response = await fetchJson(url, { apiKey: connection.apiKey, signal });
  } catch (error) {
    if (error instanceof ProviderError && (error.status === 404 || error.status === 405)) {
      throw ProviderError.modelsUnsupported(url, error.status, error.providerMessage);
    }
    throw error;
  }
  const payload = (await response.json()) as ModelsResponse;
  return payload.data
    .map((item) => ({ id: item.id, contextLength: null }))
    .sort((a, b) => a.id.localeCompare(b.id));
}
