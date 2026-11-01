import { ApiError } from '@wbfm/shared/errors';
import { type DiscoveredModel, type ProviderModel } from '@wbfm/shared/types';
import { type ModelCapability } from '@wbfm/shared/constants';
import { type ModelCreateInput } from '@wbfm/shared/schemas';
import { createModelRepository, createProviderRepository } from '@wbfm/database';
import {
  ProviderError,
  findVendorByBaseUrl,
  resolveVendorDiscovery,
} from '@wbfm/ai';
import type { ServiceDeps } from '../base/deps';
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

    /** 从供应商远端实时拉取模型发现项（不落库，供前端选择后手工添加；v0.5 附带自动探测的上下文长度） */
    async fetchRemoteList(
      providerId: string,
      signal?: AbortSignal,
    ): Promise<DiscoveredModel[]> {
      const provider = requireProvider(providerId);
      const vendor = findVendorByBaseUrl(provider.baseUrl);
      // v2.17：厂商明确不支持模型列表时，直接返回推荐模型（可能为空），不再把 404 抛给用户
      if (resolveVendorDiscovery(vendor) === 'manual-only') {
        return (vendor?.models ?? []).map((model) => ({
          id: model.modelId,
          contextLength: null,
        }));
      }
      try {
        return await buildProvider(db, cipher, provider).listModels(signal);
      } catch (error) {
        // 端点不存在时回落到描述文件里的推荐模型；没有推荐模型才报错
        if (error instanceof ProviderError && error.reason === 'models_unsupported') {
          const recommended = vendor?.models ?? [];
          if (recommended.length > 0) {
            return recommended.map((model) => ({ id: model.modelId, contextLength: null }));
          }
        }
        toApiError(error);
      }
    },
  };
}

export type ModelService = ReturnType<typeof createModelService>;
