import { traceAsync } from '../../observability/tracer';
import { fetchJson } from '../../http/fetch-with-retry';
import type { EmbedParams, EmbedResult, ProviderConnection } from '../../types';
import { OPENAI_ENDPOINTS, joinEndpoint } from './url';

/** 单次 embeddings 请求的最大输入条数，超出自动分批 */
export const EMBED_BATCH_SIZE = 64;

/** trace 输入预览的单条字符上限，避免文档分片全文刷爆面板 */
const PREVIEW_LIMIT = 200;

interface EmbeddingsResponse {
  data: Array<{ index: number; embedding: number[] }>;
  model?: string;
}

export async function openAiEmbed(
  connection: ProviderConnection,
  params: EmbedParams,
): Promise<EmbedResult> {
  if (params.input.length === 0) return { vectors: [], dimension: 0 };
  return traceAsync(
    {
      name: `embed:${params.model}`,
      runType: 'embedding',
      inputs: {
        model: params.model,
        count: params.input.length,
        preview: params.input.slice(0, 2).map((text) => text.slice(0, PREVIEW_LIMIT)),
      },
      metadata: {
        provider: connection.protocol,
        baseUrl: connection.baseUrl,
        ls_model_name: params.model,
      },
    },
    () => embedBatches(connection, params),
    (result) => ({ count: result.vectors.length, dimension: result.dimension }),
  );
}

async function embedBatches(
  connection: ProviderConnection,
  params: EmbedParams,
): Promise<EmbedResult> {
  const batches: string[][] = [];
  for (let i = 0; i < params.input.length; i += EMBED_BATCH_SIZE) {
    batches.push(params.input.slice(i, i + EMBED_BATCH_SIZE));
  }

  const vectors: number[][] = new Array(params.input.length);
  let offset = 0;
  for (const batch of batches) {
    const response = await fetchJson(
      joinEndpoint(connection.baseUrl, OPENAI_ENDPOINTS.embeddings),
      {
        method: 'POST',
        apiKey: connection.apiKey,
        signal: params.signal,
        body: { model: params.model, input: batch },
      },
    );
    const payload = (await response.json()) as EmbeddingsResponse;
    for (const item of payload.data) vectors[offset + item.index] = item.embedding;
    offset += batch.length;
  }

  const dimension = vectors[0]?.length ?? 0;
  for (const vector of vectors) {
    if (!Array.isArray(vector) || vector.length !== dimension) {
      throw new Error('嵌入接口返回的向量维度不一致');
    }
  }
  return { vectors, dimension };
}
