import type { ServiceDeps } from '../services/deps';
import { resolveEmbeddingTarget } from '../ingestion/embedding-target';

/** 批量文本嵌入：未配置嵌入模型或空输入返回 null；向量条数与输入不一致直接抛错 */
export async function embedTexts(
  deps: ServiceDeps,
  texts: string[],
  signal?: AbortSignal,
): Promise<{ vectors: number[][]; dimension: number } | null> {
  const target = resolveEmbeddingTarget(deps);
  if (!target || texts.length === 0) return null;
  const result = await target.provider.embed({
    model: target.model.modelId,
    input: texts,
    signal,
  });
  if (result.vectors.length !== texts.length) {
    throw new Error('嵌入向量数量与输入不一致');
  }
  return { vectors: result.vectors, dimension: result.dimension };
}
