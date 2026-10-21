import type { DatabaseInstance } from '@wbfm/database';
import { createModelRepository, createProviderRepository } from '@wbfm/database';
import type { ModelCapability } from '@wbfm/shared/constants';
import {
  DEMO_BASE_URL,
  DEMO_CHAT_MODEL_ID,
  DEMO_EMBED_MODEL_ID,
  DEMO_PROVIDER_ID,
  DEMO_PROVIDER_NAME,
} from '@wbfm/shared/constants';

export interface DemoModeArtifacts {
  providerId: string;
  chatModelId: string;
  embedModelId: string;
}

/**
 * v2.4 M1：开启演示模式——建（或复用）id 固定的内置 `demo` 供应商与两个 mock 模型。
 * 幂等：重复开启只补建缺失项，不覆盖已有记录。返回三个 id 供调用方回写默认模型。
 */
export function enableDemoMode(db: DatabaseInstance): DemoModeArtifacts {
  const providers = createProviderRepository(db);
  const models = createModelRepository(db);

  const provider = providers.get(DEMO_PROVIDER_ID) ?? providers.create({
    id: DEMO_PROVIDER_ID,
    name: DEMO_PROVIDER_NAME,
    protocol: 'openai-compatible',
    baseUrl: DEMO_BASE_URL,
    apiKeyCipher: null,
    enabled: true,
    sortOrder: -1,
  });

  const ensureModel = (modelId: string, capabilities: ModelCapability[]): string => {
    const existing = models.listByProvider(DEMO_PROVIDER_ID).find((m) => m.modelId === modelId);
    if (existing) return existing.id;
    return models.create({
      providerId: DEMO_PROVIDER_ID,
      modelId,
      capabilities,
      contextWindow: null,
    }).id;
  };

  return {
    providerId: provider.id,
    chatModelId: ensureModel(DEMO_CHAT_MODEL_ID, ['chat']),
    embedModelId: ensureModel(DEMO_EMBED_MODEL_ID, ['embedding']),
  };
}

/**
 * v2.4 M1：关闭演示模式——删除内置 `demo` 供应商（外键级联删其模型）。
 * 返回被删的两个模型 id（不存在则为空串），供调用方判断默认模型是否需清空。
 */
export function disableDemoMode(db: DatabaseInstance): { chatModelId: string; embedModelId: string } {
  const existing = createModelRepository(db).listByProvider(DEMO_PROVIDER_ID);
  const find = (modelId: string) => existing.find((m) => m.modelId === modelId)?.id ?? '';
  const ids = { chatModelId: find(DEMO_CHAT_MODEL_ID), embedModelId: find(DEMO_EMBED_MODEL_ID) };
  createProviderRepository(db).delete(DEMO_PROVIDER_ID);
  return ids;
}
