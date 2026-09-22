import type { ChatProvider } from '@wbfm/ai';
import type { ProviderModel } from '@wbfm/shared';
import {
  createModelRepository,
  createProviderRepository,
  createSettingsRepository,
} from '@wbfm/database';
import type { ServiceDeps } from '../services/deps';
import { buildProvider } from '../services/provider-adapter';

export interface ResolvedVisionTarget {
  provider: ChatProvider;
  model: ProviderModel;
}

const SETTINGS_KEY = 'app-settings';

/**
 * 解析 OCR 用视觉模型（v0.4）：
 * 1. 优先全局默认对话模型，但必须具备 vision 能力；
 * 2. 否则取任意启用供应商下的第一个 vision 模型；
 * 3. 都没有则返回 null（调用方降级 tesseract 或报错）。
 */
export function resolveVisionTarget(deps: ServiceDeps): ResolvedVisionTarget | null {
  const { db, cipher } = deps;
  const models = createModelRepository(db);
  const providers = createProviderRepository(db);

  const resolve = (model: ProviderModel): ResolvedVisionTarget | null => {
    const providerRecord = providers.get(model.providerId);
    if (!providerRecord || !providerRecord.enabled) return null;
    return { provider: buildProvider(db, cipher, providerRecord), model };
  };

  const appSettings = createSettingsRepository(db).getJson<{
    defaultChatModelId?: string | null;
  }>(SETTINGS_KEY, {});

  const defaultId = appSettings.defaultChatModelId ?? null;
  if (defaultId) {
    const defaultModel = models.findById(defaultId);
    if (defaultModel?.capabilities.includes('vision')) {
      const target = resolve(defaultModel);
      if (target) return target;
    }
  }

  const visionModels = models.listByCapability('vision');
  for (const model of visionModels) {
    const target = resolve(model);
    if (target) return target;
  }
  return null;
}
