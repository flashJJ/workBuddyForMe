import { fetchJson } from '../../http/fetch-with-retry';
import type { ProviderConnection } from '../../types';
import { OPENAI_ENDPOINTS, joinEndpoint } from './url';

interface ModelsResponse {
  data: Array<{ id: string }>;
}

/** GET /models；testConnection 复用本方法做轻量探活 */
export async function openAiListModels(
  connection: ProviderConnection,
  signal?: AbortSignal,
): Promise<string[]> {
  const response = await fetchJson(joinEndpoint(connection.baseUrl, OPENAI_ENDPOINTS.models), {
    apiKey: connection.apiKey,
    signal,
  });
  const payload = (await response.json()) as ModelsResponse;
  return payload.data.map((item) => item.id).sort((a, b) => a.localeCompare(b));
}
