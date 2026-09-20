import { ApiError, type Assistant } from '@wbfm/shared';
import type { ChatProvider } from '@wbfm/ai';
import type { ProviderModel } from '@wbfm/shared';
import {
  createModelRepository,
  createProviderRepository,
  createSettingsRepository,
} from '@wbfm/database';
import type { ServiceDeps } from '../services/deps';
import { buildProvider } from '../services/provider-adapter';

export interface ResolvedChatTarget {
  provider: ChatProvider;
  model: ProviderModel;
}

const SETTINGS_KEY = 'app-settings';

/** 解析实际对话模型：助手绑定优先，否则跟随全局默认 */
export function resolveChatTarget(
  { db, cipher }: ServiceDeps,
  assistant: Assistant,
): ResolvedChatTarget {
  const settings = createSettingsRepository(db);
  const appSettings = settings.getJson<{ defaultChatModelId?: string | null }>(SETTINGS_KEY, {});
  const modelId = assistant.modelId ?? appSettings.defaultChatModelId ?? null;
  if (!modelId) {
    throw new ApiError(
      'VALIDATION_ERROR',
      '未配置对话模型：请在助手或设置中选择默认对话模型',
    );
  }

  const models = createModelRepository(db);
  const model = models.findById(modelId);
  if (!model) throw new ApiError('VALIDATION_ERROR', `对话模型不存在：${modelId}`);

  const providers = createProviderRepository(db);
  const providerRecord = providers.get(model.providerId);
  if (!providerRecord) throw new ApiError('VALIDATION_ERROR', '模型所属供应商不存在');
  if (!providerRecord.enabled) throw new ApiError('VALIDATION_ERROR', '供应商已停用');

  return { provider: buildProvider(db, cipher, providerRecord), model };
}
