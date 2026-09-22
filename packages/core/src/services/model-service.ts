import { ApiError, type ModelCapability, type ModelCreateInput, type ProviderModel } from '@wbfm/shared';
import { createModelRepository, createProviderRepository } from '@wbfm/database';
import type { ServiceDeps } from './deps';
import { buildProvider, toApiError } from './provider-adapter';

export function createModelService({ db, cipher }: ServiceDeps) {
  const providers = createProviderRepository(db);
  const models = createModelRepository(db);

  const requireProvider = (providerId: string) => {
    const provider = providers.get(providerId);
    if (!provider) throw ApiError.notFound('供应商', providerId);
    return provider;
  };

  return {
    listByProvider(providerId: string): ProviderModel[] {
      requireProvider(providerId);
      return models.listByProvider(providerId);
    },

    listByCapability(capability: ModelCapability): ProviderModel[] {
      return models.listByCapability(capability);
    },

    findById(id: string): ProviderModel | null {
      return models.findById(id);
    },

    /** 手工维护：新增模型记录（重复 modelId 冲突） */
    add(providerId: string, input: ModelCreateInput): ProviderModel {
      requireProvider(providerId);
      if (models.exists(providerId, input.modelId)) {
        throw ApiError.conflict(`模型已存在：${input.modelId}`);
      }
      return models.create({
        providerId,
        modelId: input.modelId,
        displayName: input.displayName,
        capabilities: input.capabilities,
        contextWindow: input.contextWindow ?? null,
      });
    },

    delete(id: string): void {
      if (!models.delete(id)) throw ApiError.notFound('模型', id);
    },

    /** 从供应商远端实时拉取模型 ID 列表（不落库，供前端选择后手工添加） */
    async fetchRemoteList(
      providerId: string,
      signal?: AbortSignal,
    ): Promise<string[]> {
      const provider = requireProvider(providerId);
      try {
        return await buildProvider(db, cipher, provider).listModels(signal);
      } catch (error) {
        toApiError(error);
      }
    },
  };
}

export type ModelService = ReturnType<typeof createModelService>;
