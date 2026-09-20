import type { ChatProvider } from '@wbfm/ai';
import type { ProviderModel } from '@wbfm/shared';
import {
  createModelRepository,
  createProviderRepository,
  createSettingsRepository,
} from '@wbfm/database';
import type { ServiceDeps } from '../services/deps';
import { buildProvider } from '../services/provider-adapter';

const SETTINGS_KEY = 'app-settings';

export interface ResolvedEmbeddingTarget {
  provider: ChatProvider;
  model: ProviderModel;
}

/** 解析 embedding 模型：取设置中的默认模型，须具备 embedding 能力；未配置返回 null */
export function resolveEmbeddingTarget(
  { db, cipher }: ServiceDeps,
): ResolvedEmbeddingTarget | null {
  const settings = createSettingsRepository(db);
  const appSettings = settings.getJson<{ defaultEmbeddingModelId?: string | null }>(
    SETTINGS_KEY,
    {},
  );
  const modelId = appSettings.defaultEmbeddingModelId ?? null;
  if (!modelId) return null;

  const model = createModelRepository(db).findById(modelId);
  if (!model || !model.capabilities.includes('embedding')) return null;

  const providerRecord = createProviderRepository(db).get(model.providerId);
  if (!providerRecord || !providerRecord.enabled) return null;

  return { provider: buildProvider(db, cipher, providerRecord), model };
}
