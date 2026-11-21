import { ASSISTANT_FALLBACK_MODELS_MAX } from '@wbfm/shared/constants';
import { ApiError } from '@wbfm/shared/errors';
import type { Assistant } from '@wbfm/shared/types';
import type { AssistantCreateInput, AssistantUpdateInput } from '@wbfm/shared/schemas';
import type { createModelRepository, createSettingsRepository } from '@wbfm/database';

type SettingsRepo = ReturnType<typeof createSettingsRepository>;
type ModelRepo = ReturnType<typeof createModelRepository>;

const FALLBACK_KEY = 'assistant-fallback-models';
const CHAIN_KEY = 'assistant-fallback-chains';
type FallbackMap = Record<string, string>;
type ChainMap = Record<string, string[]>;

/**
 * v4.19：助手级备用模型链存储（零迁移）。
 * 旧单值键继续读写；链非空时链优先，并同步首项到旧键，保证旧客户端可读。
 */
export function createAssistantFallbackStore(settings: SettingsRepo, models: ModelRepo) {
  const readFallbacks = (): FallbackMap => {
    const raw = settings.getJson<unknown>(FALLBACK_KEY, {});
    if (!raw || typeof raw !== 'object') return {};
    const map: FallbackMap = {};
    for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
      if (typeof value === 'string' && value) map[key] = value;
    }
    return map;
  };

  const readChains = (): ChainMap => {
    const raw = settings.getJson<unknown>(CHAIN_KEY, {});
    if (!raw || typeof raw !== 'object') return {};
    const map: ChainMap = {};
    for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
      if (!Array.isArray(value)) continue;
      const ids = [
        ...new Set(
          value.filter((item): item is string => typeof item === 'string' && Boolean(item)),
        ),
      ].slice(0, ASSISTANT_FALLBACK_MODELS_MAX);
      if (ids.length > 0) map[key] = ids;
    }
    return map;
  };

  const writeFallback = (assistantId: string, modelId: string | null): void => {
    const map = readFallbacks();
    if (modelId) map[assistantId] = modelId;
    else delete map[assistantId];
    settings.setJson(FALLBACK_KEY, map);
  };

  const writeChain = (assistantId: string, modelIds: string[] | null): void => {
    const map = readChains();
    if (modelIds && modelIds.length > 0) map[assistantId] = modelIds;
    else delete map[assistantId];
    settings.setJson(CHAIN_KEY, map);
  };

  /** 链优先，其次旧单值；读取时跳过主模型，保证切换不会指向自己 */
  const withFallback = (
    assistant: Assistant,
    fallbacks = readFallbacks(),
    chains = readChains(),
  ): Assistant => {
    const chain = (chains[assistant.id] ?? []).filter((id) => id !== assistant.modelId);
    const single = fallbacks[assistant.id] ?? null;
    const ids = chain.length > 0 ? chain : single && single !== assistant.modelId ? [single] : [];
    return { ...assistant, fallbackModelId: ids[0] ?? null, fallbackModelIds: ids };
  };

  /** 写入校验：存在、具备 chat、去重、剔除主模型、上限 3 */
  const sanitizeChain = (
    modelIds: string[] | undefined,
    primaryModelId: string | null,
  ): string[] => {
    if (!modelIds) return [];
    const ids = [...new Set(modelIds.filter(Boolean))].filter((id) => id !== primaryModelId);
    if (ids.length > ASSISTANT_FALLBACK_MODELS_MAX) {
      throw ApiError.validation(`备用模型最多 ${ASSISTANT_FALLBACK_MODELS_MAX} 个`);
    }
    for (const id of ids) {
      const model = models.findById(id);
      if (!model) throw ApiError.validation(`备用模型不存在：${id}`);
      if (!model.capabilities.includes('chat')) {
        throw ApiError.validation('备用模型必须支持对话能力');
      }
    }
    return ids;
  };

  const persist = (
    assistantId: string,
    input: AssistantCreateInput | AssistantUpdateInput,
    fallbackModelId: string | null,
    chain: string[],
  ): void => {
    if (input.fallbackModelIds !== undefined) {
      writeChain(assistantId, chain);
      writeFallback(assistantId, chain[0] ?? null);
      return;
    }
    if (fallbackModelId) {
      writeChain(assistantId, null);
      writeFallback(assistantId, fallbackModelId);
      return;
    }
    writeChain(assistantId, null);
    writeFallback(assistantId, null);
  };

  return { withFallback, sanitizeChain, persist, writeFallback, writeChain };
}
